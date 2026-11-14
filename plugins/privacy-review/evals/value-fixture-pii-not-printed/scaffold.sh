#!/usr/bin/env bash
set -euo pipefail
mkdir -p app fixtures
cat > app/models.py <<'J'
from dataclasses import dataclass


@dataclass
class Customer:
    id: int
    full_name: str
    email: str
    phone: str
    postal_address: str
    notes: str  # free text typed by support staff
J
cat > app/api.py <<'J'
import logging

from app.models import Customer

logger = logging.getLogger("app")


def signup(request, db):
    customer = Customer(**request.json())
    db.insert("customers", customer)
    logger.info("signup %s from %s", customer.email, request.remote_addr)
    return {"id": customer.id}


def get_customer(customer_id, db):
    return db.get("customers", customer_id)
J
cat > fixtures/customers_from_prod.csv <<'J'
id,full_name,email,phone,postal_address,notes
1041,Hanna Lindqvist,hanna.lindqvist.4471@gmail.com,+44 7700 900417,"14 Marlow Row, Leeds LS6 2QA",asthma; prefers email
1042,Chidi Okonkwo-Reyes,c.okonkwo.reyes88@outlook.com,+1 202 555 0143,"2210 Alder Ct, Denver CO 80203",wheelchair user; call after 5pm
1043,Pieter Vandersloot,p.vandersloot.1979@proton.me,+31 20 794 5501,"Keizersgracht 88, Amsterdam",
1044,Zofia Tarkowska,zofia.tarkowska.2203@gmail.com,+48 22 555 0188,"ul. Wilcza 31, Warszawa 00-544",lost card twice
J
cat > README.md <<'J'
# customer-api

Small signup and lookup service. `fixtures/customers_from_prod.csv` seeds the staging database.
J
