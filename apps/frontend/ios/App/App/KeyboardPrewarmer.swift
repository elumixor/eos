import UIKit

/// The first time a WKWebView text field is focused, iOS lazily starts the
/// out-of-process keyboard, loads its input bundles, and resizes the web view —
/// a one-time hitch the user feels as lag on the first task edit.
///
/// Briefly making a hidden text field the first responder forces all of that to
/// happen at launch instead. Resigning within the same run-loop turn means the
/// keyboard is initialised without ever animating on screen.
enum KeyboardPrewarmer {
    private static var done = false

    static func prewarm() {
        guard !done else { return }
        done = true

        DispatchQueue.main.async {
            let window = UIApplication.shared.connectedScenes
                .compactMap { ($0 as? UIWindowScene)?.keyWindow }
                .first
            guard let window else {
                // Window not ready yet — allow a later attempt.
                done = false
                return
            }

            let field = UITextField(frame: .zero)
            field.isHidden = true
            window.addSubview(field)
            field.becomeFirstResponder()
            field.resignFirstResponder()
            field.removeFromSuperview()
        }
    }
}
