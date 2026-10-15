import json
import re
from html import unescape
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

import httpx
from pydantic import BaseModel, ConfigDict, ValidationError

from app.backend.board_games.clients.base import BoardGameBaseClient
from app.backend.board_games.schemas import BoardGameProviderResult


class GeekachProduct(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str
    url: str
    price: float | None = None
    in_stock: bool | None = None


class _CatalogImagesParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.images: dict[str, str] = {}

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "img":
            return
        attributes = dict(attrs)
        classes = (attributes.get("class") or "").split()
        if "catalogCard-img" not in classes:
            return
        title = (attributes.get("alt") or attributes.get("title") or "").strip()
        source = attributes.get("src") or attributes.get("data-src")
        if title and source:
            self.images[_normalize_title(title)] = source


class GeekachBoardGameClient(BoardGameBaseClient):
    SEARCH_URL = "https://geekach.com.ua/catalog/search/"

    async def search(self, title: str) -> list[BoardGameProviderResult]:
        query = title.strip()
        if not query:
            return []

        async with httpx.AsyncClient(
            timeout=12.0,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; ClubsBoardGameSearch/1.0)"
            },
            follow_redirects=True,
        ) as client:
            response = await client.get(self.SEARCH_URL, params={"q": query})
            response.raise_for_status()

        products = _extract_products(response.text)
        image_parser = _CatalogImagesParser()
        image_parser.feed(response.text)
        results: list[BoardGameProviderResult] = []
        for product in products:
            absolute_url = urljoin(self.SEARCH_URL, product.url)
            path = urlparse(absolute_url).path.rstrip("/")
            if not path:
                continue
            image = image_parser.images.get(_normalize_title(product.title))
            results.append(
                BoardGameProviderResult(
                    provider="geekach",
                    external_id=path,
                    title=product.title.strip(),
                    cover_image_url=urljoin(self.SEARCH_URL, image) if image else None,
                    product_url=absolute_url,
                    price=product.price,
                    in_stock=product.in_stock,
                )
            )
        return results


def _extract_products(page: str) -> list[GeekachProduct]:
    # Geekach embeds its search product list as JSON in the page's catalog script.
    match = re.search(r"\bproducts\s*=\s*(?=\[)", page)
    if match is None:
        raise ValueError("Geekach search page did not contain a product list")
    try:
        payload, _ = json.JSONDecoder().raw_decode(page[match.end() :])
        if not isinstance(payload, list):
            raise ValueError("Geekach search product list was not an array")
        return [
            GeekachProduct.model_validate(item)
            for item in payload
            if isinstance(item, dict)
        ]
    except (json.JSONDecodeError, ValidationError) as exc:
        raise ValueError("Geekach returned an invalid search product list") from exc


def _normalize_title(value: str) -> str:
    return " ".join(unescape(value).split()).casefold()
