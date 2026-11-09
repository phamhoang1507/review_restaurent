from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.reviews.models import Review


def get_place_ratings(
    session: Session,
    place_ids: list[int],
) -> dict[int, dict[str, float | int]]:
    if not place_ids:
        return {}

    rows = session.execute(
        select(
            Review.place_id,
            func.count(Review.id).label("review_count"),
            func.sum(
                Review.space_rating
                + Review.food_drink_rating
                + Review.value_rating
            ).label("total_points"),
        )
        .where(Review.place_id.in_(place_ids))
        .group_by(Review.place_id)
    ).all()

    return {
        place_id: {
            "rating": round(total_points / (review_count * 3), 2),
            "review_count": review_count,
        }
        for place_id, review_count, total_points in rows
    }