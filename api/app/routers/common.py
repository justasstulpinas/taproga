from typing import Annotated

from fastapi import Depends, Query

from app.pagination import Cursor, PageRequest
from app.schemas.common import PAGE_LIMIT_DEFAULT, PageLimit


def get_page_request(
    limit: PageLimit = PAGE_LIMIT_DEFAULT,
    cursor: Annotated[str | None, Query(max_length=200)] = None,
) -> PageRequest:
    return PageRequest(limit=limit, after=Cursor.decode(cursor) if cursor else None)


PageParams = Annotated[PageRequest, Depends(get_page_request)]
