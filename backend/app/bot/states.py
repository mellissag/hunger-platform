"""FSM-состояния бота (02_BOT_FLOWS.md §1, §15)."""

from __future__ import annotations

from aiogram.fsm.state import State, StatesGroup


class LanguageStates(StatesGroup):
    select = State()


class MainStates(StatesGroup):
    menu = State()


class BookingStates(StatesGroup):
    start = State()
    choose_flow = State()
    pick_master = State()
    pick_service_for_master = State()
    pick_service = State()
    pick_master_for_service = State()
    pick_date = State()
    pick_time = State()
    enter_name = State()
    enter_phone = State()
    confirm = State()
    prepayment = State()
    success = State()


class MyBookingsStates(StatesGroup):
    list_ = State()
    card = State()
    cancel_confirm = State()
    reschedule_date = State()
    reschedule_time = State()


class ProfileStates(StatesGroup):
    view = State()
    edit_name = State()
    edit_phone = State()
    delete_confirm = State()


class AIChatStates(StatesGroup):
    chat = State()
