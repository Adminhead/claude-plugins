from app.session import make_session, is_valid


def test_login_session_is_valid():
    s = make_session("ada")
    assert is_valid(s)


def test_login_refreshes_ttl():
    s = make_session("ada", ttl=60)
    assert s["expires"] - __import__("time").time() > 3000
