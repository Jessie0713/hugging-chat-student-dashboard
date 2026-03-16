import os
import pymysql
from sshtunnel import SSHTunnelForwarder

class DoubleSSHTunnelDB:
    """
    SSH1 -> forward to SSH2
    SSH2 -> forward to DB_HOST_API:DB_PORT_API
    then connect pymysql to local forwarded port
    """

    def __init__(self):
        self.t1 = None
        self.t2 = None
        self.db_conn = None

    def __enter__(self):
        ssh1_host = os.getenv("SSH1_HOST")
        ssh1_port = int(os.getenv("SSH1_PORT", "22"))
        ssh1_user = os.getenv("SSH1_USER")
        ssh1_pass = os.getenv("SSH1_PASS")

        ssh2_host = os.getenv("SSH2_HOST")
        ssh2_port = int(os.getenv("SSH2_PORT", "22"))
        ssh2_user = os.getenv("SSH2_USER")
        ssh2_pass = os.getenv("SSH2_PASS")

        db_host = os.getenv("DB_HOST_API")
        db_port = int(os.getenv("DB_PORT_API", "3306"))
        db_user = os.getenv("DB_USER_API")
        db_pass = os.getenv("DB_PASS_API", "").strip('"')
        db_name = os.getenv("DB_NAME_API")

        # 1) local -> SSH1, forward local_port_ssh2 -> SSH2:SSH2_PORT
        self.t1 = SSHTunnelForwarder(
            (ssh1_host, ssh1_port),
            ssh_username=ssh1_user,
            ssh_password=ssh1_pass,
            remote_bind_address=(ssh2_host, ssh2_port),
            local_bind_address=("127.0.0.1", 0),
        )
        self.t1.start()
        local_ssh2_port = self.t1.local_bind_port

        # 2) local -> (forwarded SSH2), forward local_port_db -> DB_HOST_API:DB_PORT_API
        self.t2 = SSHTunnelForwarder(
            ("127.0.0.1", local_ssh2_port),
            ssh_username=ssh2_user,
            ssh_password=ssh2_pass,
            remote_bind_address=(db_host, db_port),
            local_bind_address=("127.0.0.1", 0),
        )
        self.t2.start()
        local_db_port = self.t2.local_bind_port

        # DB connect via forwarded local port
        self.db_conn = pymysql.connect(
            host="127.0.0.1",
            port=local_db_port,
            user=db_user,
            password=db_pass,
            database=db_name,
            charset="utf8mb4",
            cursorclass=pymysql.cursors.DictCursor,
        )
        return self.db_conn

    def __exit__(self, exc_type, exc, tb):
        try:
            if self.db_conn:
                self.db_conn.close()
        finally:
            if self.t2:
                self.t2.stop()
            if self.t1:
                self.t1.stop()


def fetch_one(sql: str, params=None):
    with DoubleSSHTunnelDB() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            return cur.fetchone()