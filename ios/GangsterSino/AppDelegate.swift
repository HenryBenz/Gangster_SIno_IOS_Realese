internal import Expo
import React
import ReactAppDependencyProvider
import StoreKit

/// App Store Connect refuses promoted purchases unless the app binary itself
/// uses PurchaseIntent. The iterator is created before React Native starts,
/// so this is the consumer of PurchaseIntent.intents.
private enum PromotedPurchaseSupport {
  private static var iteratorTask: Task<Void, Never>?

  static func start() {
    guard iteratorTask == nil else { return }
    guard #available(iOS 16.4, *) else { return }
    let consumer = Consumer()
    iteratorTask = Task { @MainActor in
      while let intent = await consumer.next() {
        await purchase(intent)
      }
    }
  }

  @available(iOS 16.4, *)
  private final class Consumer: @unchecked Sendable {
    private var iterator = PurchaseIntent.intents.makeAsyncIterator()

    func next() async -> PurchaseIntent? {
      await iterator.next()
    }
  }

  @available(iOS 16.4, *)
  private static func purchase(_ intent: PurchaseIntent) async {
    do {
      if #available(iOS 18.0, *), let offer = intent.offer {
        _ = try await intent.product.purchase(options: [.winBackOffer(offer)])
      } else {
        _ = try await intent.product.purchase()
      }
    } catch {
      // StoreKit shows the sheet. The JS listener grants Black Label after payment.
    }
  }
}

@main
class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    PromotedPurchaseSupport.start()
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    // The window is created and React Native is started by `SceneDelegate` under the
    // scene-based life cycle (required by the iOS 27 SDK).
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  // Extension point for config-plugins

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    // needed to return the correct URL for expo-dev-client.
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
