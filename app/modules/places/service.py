from fastapi import HTTPException, status
from sqlalchemy import and_, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.locations.models import District
from app.modules.places.models import Place
from app.modules.places.pagination import decode_cursor, encode_cursor
from app.modules.places.schemas import (
    PlaceCreate,
    PlaceListResponse,
    PlaceResponse,
    PlaceUpdate,
)


def require_district(session: Session, district_id: int) -> None:
    if session.get(District, district_id) is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="District does not exist",
        )


def commit_place(session: Session) -> None:
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()

        diagnostic = getattr(exc.orig, "diag", None)
        constraint_name = getattr(diagnostic, "constraint_name", None)

        if constraint_name == "fk_places_district_id_districts":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="District does not exist",
            ) from exc

        raise


def create_place(
    session: Session,
    data: PlaceCreate,
    admin_id: int,
) -> Place:
    require_district(session, data.district_id)

    place = Place(
        **data.model_dump(),
        created_by=admin_id,
        is_active=True,
    )

    session.add(place)
    commit_place(session)

    return place


def get_public_place(session: Session, place_id: int) -> Place:
    place = session.scalar(
        select(Place).where(
            Place.id == place_id,
            Place.is_active.is_(True),
        )
    )

    if place is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Place not found",
        )

    return place


def list_public_places(
    session: Session,
    *,
    limit: int,
    cursor: str | None,
    district_id: int | None,
    min_price: int | None,
    max_price: int | None,
) -> PlaceListResponse:
    if (
        min_price is not None
        and max_price is not None
        and min_price > max_price
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="min_price must not exceed max_price",
        )

    statement = select(Place).where(Place.is_active.is_(True))

    if district_id is not None:
        statement = statement.where(Place.district_id == district_id)

    if min_price is not None:
        statement = statement.where(Place.max_price >= min_price)

    if max_price is not None:
        statement = statement.where(Place.min_price <= max_price)

    if cursor:
        position = decode_cursor(cursor)

        statement = statement.where(
            or_(
                Place.created_at < position.created_at,
                and_(
                    Place.created_at == position.created_at,
                    Place.id < position.id,
                ),
            )
        )

    statement = statement.order_by(
        Place.created_at.desc(),
        Place.id.desc(),
    ).limit(limit + 1)

    rows = list(session.scalars(statement).all())
    has_more = len(rows) > limit
    items = rows[:limit]

    return PlaceListResponse(
        items=[
            PlaceResponse.model_validate(place)
            for place in items
        ],
        next_cursor=encode_cursor(items[-1]) if has_more else None,
    )


def get_place_for_update(session: Session, place_id: int) -> Place:
    place = session.scalar(
        select(Place)
        .where(Place.id == place_id)
        .with_for_update()
    )

    if place is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Place not found",
        )

    return place


def update_place(
    session: Session,
    place_id: int,
    data: PlaceUpdate,
) -> Place:
    place = get_place_for_update(session, place_id)
    updates = data.model_dump(exclude_unset=True)

    if "district_id" in updates:
        require_district(session, updates["district_id"])

    effective_min = updates.get("min_price", place.min_price)
    effective_max = updates.get("max_price", place.max_price)

    if effective_max < effective_min:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="max_price must be greater than or equal to min_price",
        )

    for field_name, value in updates.items():
        setattr(place, field_name, value)

    commit_place(session)

    return place


def deactivate_place(session: Session, place_id: int) -> None:
    place = get_place_for_update(session, place_id)
    place.is_active = False

    commit_place(session)