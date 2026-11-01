from xml.etree import ElementTree

import httpx
from pydantic import SecretStr

from app.backend.board_games.clients.base import BoardGameBaseClient
from app.backend.board_games.schemas import BoardGameProviderResult


class BoardGameGeekClient(BoardGameBaseClient):
    SEARCH_URL = "https://boardgamegeek.com/xmlapi2/search"

    def __init__(self, api_key: SecretStr | None) -> None:
        self.api_key = api_key

    async def search(self, title: str) -> list[BoardGameProviderResult]:
        query = title.strip()
        if not query:
            return []
        if self.api_key is None or not self.api_key.get_secret_value().strip():
            raise ValueError("BoardGameGeek API key is not configured")

        async with httpx.AsyncClient(timeout=12.0) as client:
            response = await client.get(
                self.SEARCH_URL,
                params={"query": query, "type": "boardgame"},
                headers={"Authorization": f"Bearer {self.api_key.get_secret_value().strip()}"},
            )
            response.raise_for_status()

        try:
            root = ElementTree.fromstring(response.content)
        except ElementTree.ParseError as exc:
            raise ValueError("BoardGameGeek returned invalid XML") from exc

        results: list[BoardGameProviderResult] = []
        for item in root.findall("item"):
            external_id = item.get("id")
            name = item.find("name")
            item_title = name.get("value") if name is not None else None
            if not external_id or not item_title:
                continue
            year_node = item.find("yearpublished")
            year_value = year_node.get("value") if year_node is not None else None
            year_published = int(year_value) if year_value and year_value.isdecimal() else None
            results.append(
                BoardGameProviderResult(
                    provider="boardgamegeek",
                    external_id=external_id,
                    title=item_title,
                    product_url=f"https://boardgamegeek.com/boardgame/{external_id}",
                    year_published=year_published,
                )
            )
        return results
