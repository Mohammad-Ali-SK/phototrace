import os,sys
from logging.config import fileConfig
from alembic import context
from sqlalchemy import create_engine
sys.path.insert(0,os.path.dirname(os.path.dirname(__file__)))
from app.models import Base
from app.config import settings
if context.config.config_file_name: fileConfig(context.config.config_file_name)
def run():
    eng=create_engine(settings.database_url)
    with eng.connect() as conn:
        context.configure(connection=conn,target_metadata=Base.metadata,compare_type=True)
        with context.begin_transaction(): context.run_migrations()
run()
