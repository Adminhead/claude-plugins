from app.models import Order

ORDERS = [Order(1, "Acme, Inc", 10.0)]


def list_orders():
    return ORDERS
