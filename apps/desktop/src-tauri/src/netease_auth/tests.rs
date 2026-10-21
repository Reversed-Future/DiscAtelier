use super::*;
#[derive(Default)]
struct MemoryVault(Mutex<Option<String>>);
impl Vault for MemoryVault {
    fn read(&self) -> Result<Option<String>, AppError> {
        Ok(self.0.lock().unwrap().clone())
    }
    fn save(&self, value: &str) -> Result<(), AppError> {
        *self.0.lock().unwrap() = Some(value.to_owned());
        Ok(())
    }
    fn forget(&self) -> Result<(), AppError> {
        *self.0.lock().unwrap() = None;
        Ok(())
    }
}
fn start(auth: &Auth) -> String {
    let id = uuid::Uuid::new_v4().to_string();
    auth.begin(id.clone(), &|op, _| {
        assert_eq!(op, "authStart");
        Ok(json!({"key":"test-key","image":"data:image/png;base64,dGVzdA=="}))
    })
    .unwrap();
    id
}
fn authorized(op: &str, _args: Value) -> Result<Value, AppError> {
    Ok(match op {
        "authCheck" => {
            json!({"code":803,"cookie":"unrelated=private; MUSIC_U=test-token; Path=/; HttpOnly"})
        }
        "authStatus" => json!({"loggedIn":true,"userId":42,"nickname":"Test"}),
        _ => panic!("unexpected operation"),
    })
}
#[test]
fn account_portrait_is_optional_and_only_allows_https_music_images() {
    for (url, allowed) in [
        ("https://p1.music.126.net/avatar.jpg", true),
        ("https://p1.music.126.net.evil.test/avatar.jpg", false),
        ("javascript:alert(1)", false),
        ("https://user:secret@p1.music.126.net/avatar.jpg", false),
    ] {
        let result =
            protocol::account(&json!({"loggedIn":true,"nickname":"Test","avatarUrl":url})).unwrap();
        assert_eq!(result.avatar_url.is_some(), allowed);
        assert_eq!(result.state, AccountState::LoggedIn);
    }
    assert!(
        protocol::account(&json!({"loggedIn":true,"nickname":"Test"}))
            .unwrap()
            .avatar_url
            .is_none()
    );
}
#[test]
fn successful_login_saves_only_music_u_and_never_serializes_credentials() {
    let auth = Auth::default();
    let vault = MemoryVault::default();
    let id = start(&auth);
    let result = auth.poll(&id, &vault, &authorized).unwrap();
    assert_eq!(vault.read().unwrap().as_deref(), Some("MUSIC_U=test-token"));
    let json = serde_json::to_string(&result).unwrap();
    assert!(json.contains("loggedIn"));
    assert!(!json.contains("test-token"));
    assert!(!json.contains("cookie"));
    assert!(auth.pending.lock().unwrap().is_none());
    let restored = Auth::default().status(&vault, &authorized).unwrap();
    assert_eq!(restored.state, AccountState::LoggedIn);
}
#[test]
fn cancelled_inflight_authorization_cannot_save_a_credential() {
    let auth = Auth::default();
    let vault = MemoryVault::default();
    let id = start(&auth);
    let result = auth.poll(&id, &vault, &|op, args| {
        if op == "authCheck" {
            auth.cancel(&id).unwrap();
        }
        authorized(op, args)
    });
    assert!(result.is_err());
    assert!(vault.read().unwrap().is_none());
    let late = uuid::Uuid::new_v4().to_string();
    auth.cancel(&late).unwrap();
    assert!(auth
        .begin(late, &|_, _| panic!("cancelled request contacted provider"))
        .is_err());
}
#[test]
fn polling_is_rate_limited_and_expired_qr_cannot_authorize() {
    let auth = Auth::default();
    let vault = MemoryVault::default();
    let id = start(&auth);
    auth.poll(&id, &vault, &|_, _| Ok(json!({"code":802})))
        .unwrap();
    let result = auth
        .poll(&id, &vault, &|_, _| panic!("polling too soon"))
        .unwrap();
    assert_eq!(serde_json::to_value(result).unwrap()["phase"], "confirming");
    auth.pending.lock().unwrap().as_mut().unwrap().created =
        Instant::now() - Duration::from_secs(301);
    let result = auth
        .poll(&id, &vault, &|_, _| {
            panic!("expired request contacted provider")
        })
        .unwrap();
    assert_eq!(serde_json::to_value(result).unwrap()["phase"], "expired");
}
#[test]
fn logout_forgets_credentials_even_when_the_provider_is_offline() {
    let auth = Auth::default();
    let vault = MemoryVault::default();
    vault.save("MUSIC_U=test-token").unwrap();
    start(&auth);
    assert_eq!(
        auth.logout(&vault, &|_, _| Err(error("offline")))
            .unwrap()
            .state,
        AccountState::LoggedOut
    );
    assert!(vault.read().unwrap().is_none());
    assert!(auth.pending.lock().unwrap().is_none());
    assert_eq!(
        auth.status(&vault, &|_, _| panic!("guest starts provider"))
            .unwrap()
            .state,
        AccountState::LoggedOut
    );
}
#[test]
fn malformed_or_missing_credentials_are_rejected_and_error_messages_are_safe() {
    for value in [
        "MUSIC_U=",
        "MUSIC_U=secret\nvalue",
        "MUSIC_U=one;MUSIC_U=two",
        "MUSIC_A=guest",
    ] {
        let e = protocol::credential(value).unwrap_err();
        assert!(!e.message.contains(value));
    }
    let auth = Auth::default();
    let vault = MemoryVault::default();
    let id = start(&auth);
    assert!(auth
        .poll(&id, &vault, &|_, _| Ok(
            json!({"code":803,"cookie":"MUSIC_A=guest"})
        ))
        .is_err());
    assert!(vault.read().unwrap().is_none());
}
#[test]
fn expired_account_is_reported_without_discarding_the_stored_credential() {
    let auth = Auth::default();
    let vault = MemoryVault::default();
    vault.save("MUSIC_U=test-token").unwrap();
    assert_eq!(
        auth.status(&vault, &|_, _| Ok(json!({"loggedIn":false})))
            .unwrap()
            .state,
        AccountState::Expired
    );
    assert!(vault.read().unwrap().is_some());
}

#[test]
fn vault_write_failure_never_reports_logged_in() {
    struct Unavailable;
    impl Vault for Unavailable {
        fn read(&self) -> Result<Option<String>, AppError> {
            Ok(None)
        }
        fn save(&self, _: &str) -> Result<(), AppError> {
            Err(error("vault unavailable"))
        }
        fn forget(&self) -> Result<(), AppError> {
            Ok(())
        }
    }
    let auth = Auth::default();
    let id = start(&auth);
    assert!(auth.poll(&id, &Unavailable, &authorized).is_err());
    assert!(auth.pending.lock().unwrap().is_some());
}
