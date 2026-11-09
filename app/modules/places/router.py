from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Response, status
from sqlalchemy.orm import Session

from app.db.session import get_session
from app.modules.auth.dependencies import require_admin
from app.modules.places.schemas import (
    MAX_BIGINT,
    MAX_INTEGER,
    PlaceCreate,
    PlaceListResponse,
    PlaceResponse,
    PlaceUpdate,
)
from app.modules.places.service import (
    create_place,
    deactivate_place,
    get_public_place,
    list_public_places,
    update_place,
    serialize_place,
)
from app.modules.users.models import User

router = APIRouter(
    prefix="/places",
    tags=["places"],
)


@router.get("", response_model=PlaceListResponse)
def list_places(
    session: Annotated[Session, Depends(get_session)],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    cursor: Annotated[str | None, Query(min_length=1, max_length=512)] = None,
    district_id: Annotated[
        int | None,
        Query(ge=1, le=MAX_BIGINT),
    ] = None,
    min_price: Annotated[
        int | None,
        Query(ge=0, le=MAX_INTEGER),
    ] = None,
    max_price: Annotated[
        int | None,
        Query(ge=0, le=MAX_INTEGER),
    ] = None,
) -> PlaceListResponse:
    return list_public_places(
        session,
        limit=limit,
        cursor=cursor,
        district_id=district_id,
        min_price=min_price,
        max_price=max_price,
    )


@router.get("/{place_id}", response_model=PlaceResponse)
def read_place(
    place_id: Annotated[int, Path(ge=1, le=MAX_BIGINT)],
    session: Annotated[Session, Depends(get_session)],
) -> PlaceResponse:
    place = get_public_place(session, place_id)
    return serialize_place(session, place)


@router.post(
    "",
    response_model=PlaceResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_place(
    data: PlaceCreate,
    session: Annotated[Session, Depends(get_session)],
    admin: Annotated[User, Depends(require_admin)],
) -> PlaceResponse:
    place = create_place(session, data, admin.id)
    return serialize_place(session, place)


@router.patch(
    "/{place_id}",
    response_model=PlaceResponse,
    dependencies=[Depends(require_admin)],
)
def edit_place(
    place_id: Annotated[int, Path(ge=1, le=MAX_BIGINT)],
    data: PlaceUpdate,
    session: Annotated[Session, Depends(get_session)],
) -> PlaceResponse:
    place = update_place(session, place_id, data)
    return serialize_place(session, place)


@router.delete(
    "/{place_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
def remove_place(
    place_id: Annotated[int, Path(ge=1, le=MAX_BIGINT)],
    session: Annotated[Session, Depends(get_session)],
) -> Response:
    deactivate_place(session, place_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)