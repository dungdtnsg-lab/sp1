import UIKit
import Capacitor

// App-local Swift plugins must be registered on the Capacitor bridge. Without
// this, JavaScript silently falls back to browser GPS and tracking stops once
// iOS locks the screen.
final class GPSBridgeViewController: CAPBridgeViewController {
    override public func capacitorDidLoad() {
        bridge?.registerPluginInstance(BackgroundGpsPlugin())
        bridge?.registerPluginInstance(DashcamNativePlugin())
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = GPSBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
