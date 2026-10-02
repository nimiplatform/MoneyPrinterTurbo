from dataclasses import dataclass
from enum import Enum
from pydantic import BaseModel

class VideoConcatMode(str, Enum):
    random = "random"
    sequential = "sequential"

class VideoTransitionMode(Enum):
    none = None
    shuffle = "Shuffle"
    fade_in = "FadeIn"
    fade_out = "FadeOut"
    slide_in = "SlideIn"
    slide_out = "SlideOut"
    zoom_in = "ZoomIn"
    zoom_out = "ZoomOut"

class VideoAspect(str, Enum):
    landscape = "16:9"
    portrait = "9:16"
    square = "1:1"
    def to_resolution(self):
        return {"16:9": (1920,1080), "9:16": (1080,1920), "1:1": (1080,1080)}[self.value]

class VideoFitMode(str, Enum):
    cover = "cover"
    contain = "contain"

@dataclass
class MaterialInfo:
    provider: str = "local"
    url: str = ""
    duration: float = 0
    source_info: dict | None = None

class VideoParams(BaseModel):
    video_subject: str = ""
    video_aspect: str = "9:16"
    video_clip_speed: float = 1
    voice_volume: float = 1
    bgm_type: str = ""
    bgm_file: str = ""
    bgm_volume: float = 0.2
    subtitle_enabled: bool = True
    subtitle_position: str = "bottom"
    subtitle_display_mode: str = "sentence"
    subtitle_animation: str = "none"
    custom_position: float = 75
    font_name: str = "NotoSansCJKsc-Regular.otf"
    text_fore_color: str = "#FFFFFF"
    text_background_color: bool | str = False
    rounded_subtitle_background: bool = False
    font_size: int = 60
    stroke_color: str = "#000000"
    stroke_width: float = 2
    n_threads: int = 2
