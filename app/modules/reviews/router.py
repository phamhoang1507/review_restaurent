from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    File,
    Path,
    Query,
    Request,
    Response,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

from app.db.session import get_session
from app.modules.auth.dependencies import get_current_user
from app.modules.reviews.dependencies import (
    get_image_upload_user,
)
from app.modules.reviews.images import (
    delete_review_image,
    list_public_review_images,
    upload_review_image,
)
from app.modules.reviews.schemas import (
    MAX_BIGINT,
    ReviewCreate,
    ReviewImageResponse,
    ReviewListResponse,
    ReviewResponse,
    ReviewUpdate,
)
from app.modules.reviews.service import (
    create_review,
    delete_review,
    list_reviews,
    update_review,
)
from app.modules.users.models import User

router = APIRouter(tags=["reviews"])


@router.get(
    "/places/{place_id}/reviews",
    response_model=ReviewListResponse,
)
def read_reviews(
    request: Request,
    response: Response,
    place_id: Annotated[
        int,
        Path(ge=1, le=MAX_BIGINT),
    ],
    session: Annotated[
        Session,
        Depends(get_session),
    ],
    limit: Annotated[
        int,
        Query(ge=1, le=100),
    ] = 20,
    cursor: Annotated[
        str | None,
        Query(
            min_length=1,
            max_length=512,
        ),
    ] = None,
) -> ReviewListResponse:
    response.headers["Cache-Control"] = "no-store"

    return list_reviews(
        session,
        place_id,
        limit=limit,
        cursor=cursor,
        public_client=(
            request.app.state.s3_public
        ),
    )


@router.post(
    "/places/{place_id}/reviews",
    response_model=ReviewResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_review(
    place_id: Annotated[
        int,
        Path(ge=1, le=MAX_BIGINT),
    ],
    data: ReviewCreate,
    session: Annotated[
        Session,
        Depends(get_session),
    ],
    user: Annotated[
        User,
        Depends(get_current_user),
    ],
) -> ReviewResponse:
    return create_review(
        session,
        place_id,
        data,
        user,
    )


@router.patch(
    "/reviews/{review_id}",
    response_model=ReviewResponse,
)
def edit_review(
    request: Request,
    response: Response,
    review_id: Annotated[
        int,
        Path(ge=1, le=MAX_BIGINT),
    ],
    data: ReviewUpdate,
    session: Annotated[
        Session,
        Depends(get_session),
    ],
    user: Annotated[
        User,
        Depends(get_current_user),
    ],
) -> ReviewResponse:
    response.headers["Cache-Control"] = "no-store"

    return update_review(
        session,
        review_id,
        data,
        user,
        request.app.state.s3_public,
    )


@router.delete(
    "/reviews/{review_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_review(
    request: Request,
    review_id: Annotated[
        int,
        Path(ge=1, le=MAX_BIGINT),
    ],
    session: Annotated[
        Session,
        Depends(get_session),
    ],
    user: Annotated[
        User,
        Depends(get_current_user),
    ],
) -> Response:
    delete_review(
        session,
        review_id,
        user,
        request.app.state.s3,
    )

    return Response(
        status_code=status.HTTP_204_NO_CONTENT
    )


@router.get(
    "/reviews/{review_id}/images",
    response_model=list[ReviewImageResponse],
)
def read_review_images(
    request: Request,
    response: Response,
    review_id: Annotated[
        int,
        Path(ge=1, le=MAX_BIGINT),
    ],
    session: Annotated[
        Session,
        Depends(get_session),
    ],
) -> list[ReviewImageResponse]:
    response.headers["Cache-Control"] = "no-store"

    return list_public_review_images(
        session,
        review_id,
        request.app.state.s3_public,
    )


@router.post(
    "/reviews/{review_id}/images",
    response_model=ReviewImageResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_review_image(
    request: Request,
    response: Response,
    review_id: Annotated[
        int,
        Path(ge=1, le=MAX_BIGINT),
    ],
    session: Annotated[
        Session,
        Depends(get_session),
    ],
    user: Annotated[
        User,
        Depends(get_image_upload_user),
    ],
    file: Annotated[
        UploadFile,
        File(),
    ],
) -> ReviewImageResponse:
    response.headers["Cache-Control"] = "no-store"

    return upload_review_image(
        session,
        request.app.state.s3,
        request.app.state.s3_public,
        review_id,
        file,
        user,
    )


@router.delete(
    "/review-images/{image_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_review_image(
    request: Request,
    image_id: Annotated[
        int,
        Path(ge=1, le=MAX_BIGINT),
    ],
    session: Annotated[
        Session,
        Depends(get_session),
    ],
    user: Annotated[
        User,
        Depends(get_current_user),
    ],
) -> Response:
    delete_review_image(
        session,
        request.app.state.s3,
        image_id,
        user,
    )

    return Response(
        status_code=status.HTTP_204_NO_CONTENT
    )