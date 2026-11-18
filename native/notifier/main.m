/**
 * dsh UI notification helper (macOS).
 *
 * macOS attributes every notification to the application bundle that posted it
 * and offers no per-notification icon override, so the dsh icon and the system
 * notification sound are only possible through a dedicated helper bundle:
 * `osascript` shows as Script Editor, and terminal-notifier shows its own
 * terminal icon. This helper is that bundle's executable.
 *
 * It posts through UserNotifications and stores the focus URI in the
 * notification, so clicking the banner reopens this helper (macOS launches a
 * notification's app with no arguments) and the click opens that URI — VS
 * Code's URI handler focuses the window that has the folder open.
 *
 * Usage (invoked by the extension host, not by hand):
 *   dshui-notifier --title T --body B [--group G] [--sound NAME] [--open URL]
 *   dshui-notifier --status     report the notification authorization state
 *
 * Exit codes: 0 posted/clicked, 1 usage, 2 bad argument, 3 not authorized,
 * 4 notification service timed out (usually no GUI session), 5 delivery failed.
 */
#import <Cocoa/Cocoa.h>
#import <UserNotifications/UserNotifications.h>

enum {
  DshuiExitSuccess = 0,
  DshuiExitUsage = 1,
  DshuiExitBadArgument = 2,
  DshuiExitNotAuthorized = 3,
  DshuiExitTimeout = 4,
  DshuiExitDeliveryFailed = 5,
};

/** userInfo key carrying the URL a click should open. */
static NSString *const DshuiOpenURLKey = @"open";

/** Notification group: one entry replaces the previous turn's banner. */
static NSString *const DshuiDefaultGroup = @"dsh";

/** How long to wait for the notification service before giving up. */
static const NSTimeInterval DshuiWatchdogSeconds = 10.0;

/** Upper bound on waiting for a human to answer the permission prompt. */
static const NSTimeInterval DshuiAuthorizationDeadlineSeconds = 120.0;

/**
 * How long an instance launched by a notification click waits for the click
 * response: macOS delivers it right after applicationDidFinishLaunching
 * returns, so the process has to linger long enough to receive it.
 */
static const NSTimeInterval DshuiResponseGraceSeconds = 5.0;

/**
 * Report a fatal failure on stderr and exit.
 * @param code - process exit code.
 * @param format - printf-style message.
 */
static void DshuiFail(int code, NSString *format, ...)
{
  va_list args;
  va_start(args, format);
  NSString *message = [[NSString alloc] initWithFormat:format arguments:args];
  va_end(args);
  fprintf(stderr, "%s\n", message.UTF8String);
  exit(code);
}

/**
 * Collapse the line breaks and tabs that would split a banner into several
 * lines (the extension already screens out other control characters).
 * @param value - raw text.
 * @returns the text with tabs/newlines collapsed to spaces.
 */
static NSString *DshuiSanitize(NSString *value)
{
  if (value == nil) return @"";
  NSString *result = value;
  for (NSString *character in @[@"\t", @"\n", @"\r"]) {
    result = [result stringByReplacingOccurrencesOfString:character withString:@" "];
  }
  return result;
}

/** Human-readable name of one notification authorization state. */
static NSString *DshuiAuthorizationName(UNAuthorizationStatus status)
{
  switch (status) {
    case UNAuthorizationStatusNotDetermined: return @"not-determined";
    case UNAuthorizationStatusDenied: return @"denied";
    case UNAuthorizationStatusAuthorized: return @"authorized";
    case UNAuthorizationStatusProvisional: return @"provisional";
  }
  return @"unknown";
}

/** Human-readable name of one per-feature notification setting. */
static NSString *DshuiSettingName(UNNotificationSetting setting)
{
  switch (setting) {
    case UNNotificationSettingNotSupported: return @"unsupported";
    case UNNotificationSettingDisabled: return @"disabled";
    case UNNotificationSettingEnabled: return @"enabled";
  }
  return @"unknown";
}

@interface DshuiNotifier : NSObject <NSApplicationDelegate, UNUserNotificationCenterDelegate>
/** Set while the permission dialog is waiting for a human, so the watchdog stands down. */
@property(nonatomic, assign) BOOL awaitingAuthorization;
/** Set by the click response handler; lets the linger timer know it was handled. */
@property(nonatomic, assign) BOOL launchedFromNotification;
/** Launch instant, bounding how long the permission prompt may stay unanswered. */
@property(nonatomic, copy) NSDate *startedAt;
@end

@implementation DshuiNotifier

- (void)applicationWillFinishLaunching:(NSNotification *)notification
{
  // Must be set before launching finishes, or a click response arrives unhandled.
  UNUserNotificationCenter.currentNotificationCenter.delegate = self;
  self.startedAt = [NSDate date];
  [self armWatchdog];
}

/**
 * Give up when the notification service never answers (no GUI session), and
 * cap how long an unanswered permission prompt may keep this process alive.
 */
- (void)armWatchdog
{
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(DshuiWatchdogSeconds * NSEC_PER_SEC)),
                 dispatch_get_main_queue(), ^{
    if (self.awaitingAuthorization) {
      NSTimeInterval waited = -[self.startedAt timeIntervalSinceNow];
      if (waited < DshuiAuthorizationDeadlineSeconds) {
        [self armWatchdog];
        return;
      }
      DshuiFail(DshuiExitTimeout,
                @"Timed out after %.0f seconds waiting for the notification permission prompt.",
                DshuiAuthorizationDeadlineSeconds);
    }
    DshuiFail(DshuiExitTimeout,
              @"Timed out after %.0f seconds waiting for the notification service. "
              @"Notifications need a logged-in GUI session.",
              DshuiWatchdogSeconds);
  });
}

- (void)applicationDidFinishLaunching:(NSNotification *)notification
{
  NSArray<NSString *> *arguments = NSProcessInfo.processInfo.arguments;

  // Launched with no arguments: macOS is delivering a notification click, and
  // the response arrives after this method returns.
  if (arguments.count == 1) {
    [self waitForClickResponse];
    return;
  }

  if ([arguments containsObject:@"--status"]) {
    [self printStatus];
    return;
  }

  NSMutableDictionary<NSString *, NSString *> *options = [NSMutableDictionary dictionary];
  for (NSUInteger index = 1; index + 1 < arguments.count; index += 2) {
    options[arguments[index]] = arguments[index + 1];
  }

  NSString *body = options[@"--body"];
  if (body.length == 0) DshuiFail(DshuiExitUsage, @"--body is required.");

  [self withAuthorization:^{
    [self postTitle:options[@"--title"] ?: @"dsh" body:body options:options];
  }];
}

/** Print the authorization state (used to diagnose "no notification shows"). */
- (void)printStatus
{
  NSBundle *bundle = NSBundle.mainBundle;
  NSString *identifier = bundle.bundleIdentifier ?: @"(none)";
  NSString *version = bundle.infoDictionary[@"CFBundleShortVersionString"] ?: @"?";
  printf("bundle %s\n", identifier.UTF8String);
  printf("version %s\n", version.UTF8String);

  [UNUserNotificationCenter.currentNotificationCenter
    getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings *settings) {
      printf("authorization %s\n", DshuiAuthorizationName(settings.authorizationStatus).UTF8String);
      printf("alert %s\n", DshuiSettingName(settings.alertSetting).UTF8String);
      printf("sound %s\n", DshuiSettingName(settings.soundSetting).UTF8String);
      fflush(stdout);
      BOOL authorized = settings.authorizationStatus == UNAuthorizationStatusAuthorized ||
                        settings.authorizationStatus == UNAuthorizationStatusProvisional;
      exit(authorized ? DshuiExitSuccess : DshuiExitNotAuthorized);
    }];
}

/**
 * Run `block` once notifications are authorized, asking for permission the
 * first time. A denied permission is reported as exit 3 so the extension can
 * fall back to an in-app toast instead of posting as another app identity.
 * @param block - delivery to run on the main queue.
 */
- (void)withAuthorization:(void (^)(void))block
{
  UNUserNotificationCenter *center = UNUserNotificationCenter.currentNotificationCenter;

  [center getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings *settings) {
    switch (settings.authorizationStatus) {
      case UNAuthorizationStatusAuthorized:
      case UNAuthorizationStatusProvisional:
        dispatch_async(dispatch_get_main_queue(), block);
        break;

      case UNAuthorizationStatusDenied:
        DshuiFail(DshuiExitNotAuthorized,
                  @"Notifications are turned off for this application. "
                  @"Enable them in System Settings > Notifications > dsh UI.");
        break;

      case UNAuthorizationStatusNotDetermined:
      default: {
        self.awaitingAuthorization = YES;
        [center requestAuthorizationWithOptions:(UNAuthorizationOptionAlert | UNAuthorizationOptionSound)
                              completionHandler:^(BOOL granted, NSError *error) {
          self.awaitingAuthorization = NO;
          if (error != nil) {
            DshuiFail(DshuiExitNotAuthorized, @"Could not ask for notification permission: %@",
                      error.localizedDescription);
          }
          if (!granted) {
            DshuiFail(DshuiExitNotAuthorized,
                      @"Permission to send notifications was declined. "
                      @"Enable it in System Settings > Notifications > dsh UI.");
          }
          dispatch_async(dispatch_get_main_queue(), block);
        }];
        break;
      }
    }
  }];
}

/**
 * Hand one notification to the notification center.
 * @param title - notification title.
 * @param body - notification body.
 * @param options - parsed command-line options (`--group`, `--sound`, `--open`).
 */
- (void)postTitle:(NSString *)title body:(NSString *)body options:(NSDictionary<NSString *, NSString *> *)options
{
  UNUserNotificationCenter *center = UNUserNotificationCenter.currentNotificationCenter;
  UNMutableNotificationContent *content = [UNMutableNotificationContent new];
  content.title = DshuiSanitize(title);
  content.body = DshuiSanitize(body);

  NSString *sound = options[@"--sound"] ?: @"default";
  if (![sound isEqualToString:@"none"]) {
    content.sound = [sound isEqualToString:@"default"]
      ? UNNotificationSound.defaultSound
      : [UNNotificationSound soundNamed:sound];
  }

  NSString *group = options[@"--group"] ?: DshuiDefaultGroup;
  content.threadIdentifier = group;

  NSString *open = options[@"--open"];
  if (open.length > 0) {
    NSURL *url = [NSURL URLWithString:open];
    if (url == nil || url.scheme.length == 0) {
      DshuiFail(DshuiExitBadArgument, @"--open expects a URL with a scheme, such as vscode://...");
    }
    content.userInfo = @{DshuiOpenURLKey: open};
  }

  // A reused identifier replaces the earlier banner, so the group and the
  // identifier are the same string: successive turns update one entry.
  [center removeDeliveredNotificationsWithIdentifiers:@[group]];
  [center removePendingNotificationRequestsWithIdentifiers:@[group]];

  UNNotificationRequest *request = [UNNotificationRequest requestWithIdentifier:group
                                                                       content:content
                                                                       trigger:nil];
  [center addNotificationRequest:request withCompletionHandler:^(NSError *error) {
    if (error != nil) {
      if ([error.domain isEqualToString:UNErrorDomain] && error.code == UNErrorCodeNotificationsNotAllowed) {
        DshuiFail(DshuiExitNotAuthorized, @"Notifications are not allowed: %@", error.localizedDescription);
      }
      DshuiFail(DshuiExitDeliveryFailed, @"Failed to deliver notification: %@", error.localizedDescription);
    }
    exit(DshuiExitSuccess);
  }];
}

/** Leave the click response a moment to arrive, then stop quietly. */
- (void)waitForClickResponse
{
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(DshuiResponseGraceSeconds * NSEC_PER_SEC)),
                 dispatch_get_main_queue(), ^{
    if (self.launchedFromNotification) return;
    exit(DshuiExitSuccess);
  });
}

#pragma mark - UNUserNotificationCenterDelegate

- (void)userNotificationCenter:(UNUserNotificationCenter *)center
       willPresentNotification:(UNNotification *)notification
         withCompletionHandler:(void (^)(UNNotificationPresentationOptions))completionHandler
{
  // Posting happens while this helper is alive; present the banner and its
  // sound even though the app is technically the foreground application.
  completionHandler(UNNotificationPresentationOptionBanner |
                    UNNotificationPresentationOptionList |
                    UNNotificationPresentationOptionSound);
}

- (void)userNotificationCenter:(UNUserNotificationCenter *)center
    didReceiveNotificationResponse:(UNNotificationResponse *)response
             withCompletionHandler:(void (^)(void))completionHandler
{
  completionHandler();
  self.launchedFromNotification = YES;

  NSString *open = response.notification.request.content.userInfo[DshuiOpenURLKey];
  [center removeDeliveredNotificationsWithIdentifiers:@[response.notification.request.identifier]];
  if (open.length == 0) exit(DshuiExitSuccess);

  BOOL opened = [[NSWorkspace sharedWorkspace] openURL:[NSURL URLWithString:open]];
  exit(opened ? DshuiExitSuccess : DshuiExitDeliveryFailed);
}

@end

int main(int argc, const char *argv[])
{
  @autoreleasepool {
    NSApplication *application = NSApplication.sharedApplication;
    // NSApplication.delegate and UNUserNotificationCenter.delegate are weak:
    // the helper object must be owned for the whole run, or a click response
    // would arrive with no delegate to handle it.
    static DshuiNotifier *notifier = nil;
    notifier = [DshuiNotifier new];
    application.delegate = notifier;
    [application run];
  }
  return DshuiExitSuccess;
}
