import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import logging

# Load environment variables from .env file
load_dotenv()

# Setup basic logging for the database connection
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Fetch MongoDB URI from environment variables
MONGO_URI = os.getenv("MONGODB_URI")

class Database:
    """
    MongoDB Database Connection Manager.
    Uses Singleton pattern to maintain a single async connection pool.
    """
    client: AsyncIOMotorClient = None
    db = None

    @classmethod
    async def connect_db(cls):
        """ Establish async connection to MongoDB """
        try:
            logger.info("Connecting to MongoDB Atlas...")
            # Initialize Motor Client with the URI
            cls.client = AsyncIOMotorClient(MONGO_URI)
            # Select the database (e.g., 'bionexus_db')
            cls.db = cls.client.bionexus_db
            logger.info("Successfully connected to MongoDB.")
        except Exception as e:
            logger.error(f"Failed to connect to MongoDB: {e}")
            raise e

    @classmethod
    async def close_db(cls):
        """ Close the MongoDB connection """
        if cls.client is not None:
            logger.info("Closing MongoDB connection...")
            cls.client.close()
            logger.info("MongoDB connection closed.")

# Export a helper function to get the database instance
def get_db():
    """ 
    Dependency injection helper for FastAPI routes.
    Returns the database instance.
    """
    if Database.db is None:
        raise Exception("Database is not initialized. Call connect_db() first.")
    return Database.db