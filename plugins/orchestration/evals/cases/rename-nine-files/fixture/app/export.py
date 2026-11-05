from app.users import get_user


def export_view(user_id):
    user = get_user(user_id)
    return {"user": user, "view": "export"}
