import asyncio
import os

from aiogram import Bot, Dispatcher
from aiogram.filters import Command
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    WebAppInfo,
)
from dotenv import load_dotenv

load_dotenv()

TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
MINI_APP_URL = os.environ["MINI_APP_URL"]

WELCOME = (
    "🫐 Привет! Это Ягодное 2026 — мини-приложение для нашего выезда.\n\n"
    "Внутри:\n"
    "🗺 Карта кэмпа — тыкни на свой домик, найди соседей\n"
    "📅 Расписание 25–26 апреля\n"
    "🔥 Почтить сгоревшую баню\n\n"
    "Жмакай кнопку ниже 👇"
)

dp = Dispatcher()


@dp.message(Command("start"))
async def on_start(message: Message) -> None:
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[[
            InlineKeyboardButton(
                text="🫐 Открыть Ягодное 2026",
                web_app=WebAppInfo(url=MINI_APP_URL),
            )
        ]]
    )
    await message.answer(WELCOME, reply_markup=keyboard)


async def main() -> None:
    bot = Bot(TOKEN)
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
