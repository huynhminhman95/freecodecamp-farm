# server.py (patched)
from contextlib import asynccontextmanager
from datetime import datetime
import os
import sys
import logging

from bson import ObjectId
from fastapi import FastAPI, HTTPException, Request, status
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
import uvicorn

from dal import ToDoDAL, ToDoList, ListSummary

logger = logging.getLogger("todo_app")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

COLLECTION_NAME = "todo_lists"
MONGODB_URI = os.environ["MONGODB_URI"]
DEBUG = os.environ.get("DEBUG", "").strip().lower() in {"true", "1", "yes", "on"}

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup:
    logger.info("Connecting to MongoDB: %s", MONGODB_URI)
    client = AsyncIOMotorClient(MONGODB_URI)
    database = client.get_default_database()

    # Ensure the database is available:
    pong = await database.command("ping")
    if int(pong.get("ok", 0)) != 1:
        raise Exception("Cluster connection is not okay")
    
    todo_list = database.get_collection(COLLECTION_NAME)
    app.todo_dal = ToDoDAL(todo_list)

    # Yield back to FastAPI application:
    yield

    # Shutdown:
    client.close()
    logger.info("MongoDB connection closed")

app = FastAPI(lifespan=lifespan, debug=DEBUG)


@app.get("/api/lists", response_model=list[ListSummary])
async def get_all_lists() -> list[ListSummary]:
    logger.info("Fetching all todo lists")
    try:
        lists = [i async for i in app.todo_dal.list_todo_lists()]
        return lists
    except Exception as exc:
        logger.exception("Error listing todo lists")
        raise HTTPException(status_code=500, detail="Failed to list todo lists")


class NewList(BaseModel):
    name: str


class NewListResponse(BaseModel):
    id: str
    name: str


@app.post("/api/lists", status_code=status.HTTP_201_CREATED, response_model=NewListResponse)
async def create_todo_list(new_list: NewList) -> NewListResponse:
    try:
        list_id = await app.todo_dal.create_todo_list(new_list.name)
        return NewListResponse(id=list_id, name=new_list.name)
    except Exception as exc:
        logger.exception("Error creating todo list")
        raise HTTPException(status_code=500, detail="Failed to create todo list")


@app.get("/api/lists/{list_id}", response_model=ToDoList)
async def get_list(list_id: str) -> ToDoList:
    try:
        todo = await app.todo_dal.get_todo_list(list_id)
        if todo is None:
            raise HTTPException(status_code=404, detail="List not found")
        return todo
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error retrieving list %s", list_id)
        raise HTTPException(status_code=500, detail="Failed to get list")


@app.delete("/api/lists/{list_id}", response_model=bool)
async def delete_list(list_id: str) -> bool:
    try:
        ok = await app.todo_dal.delete_todo_list(list_id)
        if not ok:
            raise HTTPException(status_code=404, detail="List not found")
        return True
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error deleting list %s", list_id)
        raise HTTPException(status_code=500, detail="Failed to delete list")


class NewItem(BaseModel):
    label: str

class NewItemResponse(BaseModel):
    id: str
    label: str

@app.post("/api/lists/{list_id}/items", status_code=status.HTTP_201_CREATED, response_model=ToDoList)
async def create_item(list_id: str, new_item: NewItem) -> ToDoList:
    try:
        result = await app.todo_dal.create_item(list_id, new_item.label)
        if result is None:
            raise HTTPException(status_code=404, detail="List not found")
        return result
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error creating item in list %s", list_id)
        raise HTTPException(status_code=500, detail="Failed to create item")


@app.delete("/api/lists/{list_id}/items/{item_id}", response_model=ToDoList)
async def delete_item(list_id: str, item_id: str) -> ToDoList:
    try:
        result = await app.todo_dal.delete_item(list_id, item_id)
        if result is None:
            raise HTTPException(status_code=404, detail="List or item not found")
        return result
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error deleting item %s from list %s", item_id, list_id)
        raise HTTPException(status_code=500, detail="Failed to delete item")


class ToDoItemUpdate(BaseModel):
    item_id: str
    checked_state: bool

@app.patch("/api/lists/{list_id}/items/checked_state", response_model=ToDoList)
async def set_checked_state(list_id: str, update: ToDoItemUpdate) -> ToDoList:
    try:
        result = await app.todo_dal.set_checked_state(list_id, update.item_id, update.checked_state)
        if result is None:
            raise HTTPException(status_code=404, detail="List or item not found")
        return result
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error updating checked state for item %s in list %s", update.item_id, list_id)
        raise HTTPException(status_code=500, detail="Failed to update checked state")


class DummyResponse(BaseModel):
    id: str
    when: datetime


@app.get("/api/dummy", response_model=DummyResponse)
async def get_dummy() -> DummyResponse:
    return DummyResponse(id=str(ObjectId()), when=datetime.now())


def main(argv=sys.argv[1:]):
    try:
        uvicorn.run("server:app", host="0.0.0.0", port=3001, reload=DEBUG)
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    main()
