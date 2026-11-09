from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_session
from app.modules.locations.models import District, Province
from app.modules.locations.schemas import DistrictResponse, ProvinceResponse

router = APIRouter(
    prefix="/locations",
    tags=["locations"],
)


@router.get(
    "/provinces",
    response_model=list[ProvinceResponse],
)
def list_provinces(
    session: Annotated[Session, Depends(get_session)],
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[ProvinceResponse]:
    provinces = session.scalars(
        select(Province)
        .order_by(Province.name, Province.id)
        .offset(offset)
        .limit(limit)
    ).all()

    return [
        ProvinceResponse.model_validate(province)
        for province in provinces
    ]


@router.get(
    "/provinces/{province_id}/districts",
    response_model=list[DistrictResponse],
)
def list_districts(
    province_id: Annotated[int, Path(ge=1, le=9223372036854775807)],
    session: Annotated[Session, Depends(get_session)],
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[DistrictResponse]:
    province = session.get(Province, province_id)

    if province is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Province not found",
        )

    districts = session.scalars(
        select(District)
        .where(District.province_id == province_id)
        .order_by(District.name, District.id)
        .offset(offset)
        .limit(limit)
    ).all()

    return [
        DistrictResponse.model_validate(district)
        for district in districts
    ]