import UIKit
import WebKit
import ObjectiveC

extension WKWebView {
    @objc func eos_noInputAccessoryView() -> UIView? { nil }

    /// Removes the keyboard input accessory bar (the `< > Done` toolbar) from the
    /// web view. Besides cleaning up useless keyboard chrome, this silences the
    /// recurring `_UIButtonBarButton` "Unable to simultaneously satisfy
    /// constraints" warnings, which are an Apple-internal AutoLayout bug in that
    /// accessory bar that fires whenever a text input is focused.
    static func eos_disableInputAccessoryView() {
        guard let contentView = NSClassFromString("WKContentView") else { return }
        let selector = #selector(getter: UIResponder.inputAccessoryView)
        guard
            let replacement = class_getInstanceMethod(
                WKWebView.self,
                #selector(WKWebView.eos_noInputAccessoryView)
            )
        else { return }

        // On iOS 17/18 WKContentView implements `inputAccessoryView` itself, so
        // class_addMethod would silently no-op (it only installs when the method
        // is absent). class_replaceMethod adds-or-overrides either way, and is
        // still scoped to WKContentView instances only — UIResponder is untouched.
        class_replaceMethod(
            contentView,
            selector,
            method_getImplementation(replacement),
            method_getTypeEncoding(replacement)
        )
    }
}
