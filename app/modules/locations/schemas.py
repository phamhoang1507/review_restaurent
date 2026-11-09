from pydantic import BaseModel, ConfigDict


class ProvinceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class DistrictResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    province_id: int
    name: str