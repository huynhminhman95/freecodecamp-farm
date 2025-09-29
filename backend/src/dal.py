"""
   dal.py file is responsible for handling all interactions between 
   application and the database.
"""
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorCollection
from pymongo import ReturnDocument

from pydantic import BaseModel
from typing import Optional, List
from uuid import uuid4
import logging

logger = logging.getLogger(__name__)

class ListSummary(BaseModel):
   id: Optional[str] = None
   name: str = ""
   item_count: int = 0

   @staticmethod
   def from_doc(doc) -> "ListSummary":
      if not doc:
         return ListSummary(id=None, name="", item_count=0)
      # doc["_id"] may be ObjectId
      raw_id = doc.get("_id") or doc.get("id")
      try:
         id_str = str(raw_id) if raw_id is not None else None
      except Exception:
         id_str = None

      # if items present, compute count defensively
      items = doc.get("items", [])
      try:
         count = len(items)
      except Exception:
         count = 0

      return ListSummary(
         id=id_str,
         name=doc.get("name", ""),
         item_count=count,
      )

class ToDoListItem(BaseModel):
   id: Optional[str] = None
   label: str = ""
   checked: bool = False

   @staticmethod
   def from_doc(item) -> "ToDoListItem":
      """
      Create ToDoListItem from a DB item dict.
      Accepts item with either 'id' (string) or '_id' (ObjectId or string).
      Uses .get to avoid KeyError.
      """
      if not item or not isinstance(item, dict):
         return ToDoListItem(id=None, label="", checked=False)

      raw_id = item.get("id") if item.get("id") is not None else item.get("_id")
      try:
         id_str = str(raw_id) if raw_id is not None else None
      except Exception:
         id_str = None

      return ToDoListItem(
         id=id_str,
         label=item.get("label", ""),
         checked=bool(item.get("checked", False)),
      )
   
class ToDoList(BaseModel):
   id: Optional[str] = None
   name: str = ""
   items: List[ToDoListItem] = []

   @staticmethod
   def from_doc(doc) -> "ToDoList":
      if not doc:
         return None
      raw_id = doc.get("_id") or doc.get("id")
      try:
         id_str = str(raw_id) if raw_id is not None else None
      except Exception:
         id_str = None

      items_docs = doc.get("items", []) or []
      items_list = []
      for item in items_docs:
         try:
            items_list.append(ToDoListItem.from_doc(item))
         except Exception as e:
            logger.warning("Skipping bad item while mapping ToDoList items: %s", e)

      return ToDoList(
         id=id_str,
         name=doc.get("name", ""),
         items=items_list,
      )
   
class ToDoDAL:
   def __init__(self, todo_collection: AsyncIOMotorCollection):
      self._todo_collection = todo_collection

   async def list_todo_lists(self, session=None):
      # Use find to get name and items (items used to compute count)
      async for doc in self._todo_collection.find(
         {},
         projection={"name": 1, "items": 1},
         sort=[("name", 1)],
         session=session,
      ):
         yield ListSummary.from_doc(doc)

   async def create_todo_list(self, name: str, session=None) -> str:
      response = await self._todo_collection.insert_one(
         {"name": name, "items": []}, 
         session=session
      )
      return str(response.inserted_id)
   
   async def get_todo_list(self, id: str, session=None) -> Optional[ToDoList]:
      try:
         doc = await self._todo_collection.find_one(
            {"_id": ObjectId(id)},
            session=session,
         )
      except Exception:
         # If id is not a valid ObjectId, try as string id field
         doc = await self._todo_collection.find_one({"_id": id}, session=session)

      if not doc:
         return None
      return ToDoList.from_doc(doc)
   
   async def delete_todo_list(self, id: str, session=None) -> bool:
      # remove the list by ObjectId if possible, else by string id
      try:
         response = await self._todo_collection.delete_one(
            {"_id": ObjectId(id)},
            session=session,
         )
      except Exception:
         response = await self._todo_collection.delete_one(
            {"_id": id},
            session=session,
         )
      return response.deleted_count == 1
   
   async def create_item(
         self,
         id: str | ObjectId,
         label: str,
         session=None,
   ) -> Optional[ToDoList]:
      """
      Adds a new item to items[] using a string 'id' field for the item.
      We standardize on items having {'id': '<hex>', 'label':..., 'checked':...}
      """
      item_id = uuid4().hex
      result = await self._todo_collection.find_one_and_update(
         {"_id": ObjectId(id) if not isinstance(id, str) or ObjectId.is_valid(id) else id},
         {
            "$push": {
               "items": {
                  "id": item_id,
                  "label": label,
                  "checked": False,
               }
            }
         },
         session=session,
         return_document=ReturnDocument.AFTER,
      )
      if result:
         return ToDoList.from_doc(result)
      return None
   
   async def set_checked_state(
         self,
         doc_id: str | ObjectId,
         item_id: str,
         checked_state: bool,
         session=None,
   ) -> Optional[ToDoList]:
      """
      Update checked state of an item; query uses items.id (string).
      """
      # try ObjectId for doc_id if possible
      filter_doc = {"_id": ObjectId(doc_id)} if ObjectId.is_valid(str(doc_id)) else {"_id": doc_id}
      # include items.id in filter
      filter_doc["items.id"] = item_id

      result = await self._todo_collection.find_one_and_update(
         filter_doc,
         {"$set": {"items.$.checked": checked_state}},
         session=session,
         return_document=ReturnDocument.AFTER,
      )
      if result:
         return ToDoList.from_doc(result)
      return None
      
   async def delete_item(
         self,
         doc_id: str | ObjectId,
         item_id: str,
         session=None,
   ) -> Optional[ToDoList]:
      """
      Remove item from list (use $pull on items by 'id')
      """
      try:
         filter_doc = {"_id": ObjectId(doc_id)}
      except Exception:
         filter_doc = {"_id": doc_id}

      result = await self._todo_collection.find_one_and_update(
         filter_doc,
         {"$pull": {"items": {"id": item_id}}},
         session=session,
         return_document=ReturnDocument.AFTER,
      )
      if result:
         return ToDoList.from_doc(result)
      return None
