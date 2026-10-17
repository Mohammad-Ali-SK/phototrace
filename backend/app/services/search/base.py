from abc import ABC, abstractmethod
from typing import Literal, Optional, Any
from pydantic import BaseModel, ConfigDict, Field

PlatformId = Literal['tiktok', 'instagram', 'facebook', 'linkedin', 'other']

class SearchResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    platform: PlatformId
    user: str
    caption: str
    match_type: str = Field(..., alias='matchType')
    confidence: float
    img: Optional[str] = None
    source_url: Optional[str] = Field(default=None, alias='sourceUrl')
    date: Optional[str] = None
    is_demo: bool = Field(default=False, alias='isDemo')
    provider: str
    metadata: dict[str, Any] = Field(default_factory=dict)

class SearchResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    query: str
    search_type: Literal['name', 'photo'] = Field(..., alias='searchType')
    platforms: list[PlatformId]
    provider: str
    is_demo: bool = Field(..., alias='isDemo')
    results: list[SearchResult]
    message: Optional[str] = None

class BaseSearchProvider(ABC):
    @abstractmethod
    def provider_name(self) -> str:
        """Name of the search provider."""
        pass

    @abstractmethod
    def is_configured(self) -> bool:
        """Whether this provider has active credentials configured."""
        pass

    @abstractmethod
    async def search_name(self, query: str, platforms: list[PlatformId]) -> SearchResponse:
        """Search public social media sources by name or username."""
        pass

    @abstractmethod
    async def search_photo(
        self,
        image_bytes: bytes,
        filename: str,
        platforms: list[PlatformId],
        is_sample: bool = False,
        name: Optional[str] = None,
    ) -> SearchResponse:
        """Search public social media sources using reverse-image detection (with optional name query)."""
        pass
