import logging
import os

import litserve as ls

from api import Evo2API

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)

_DEFAULT_PORT = 8001

if __name__ == "__main__":
    port = int(os.environ.get("EVO2_PORT", _DEFAULT_PORT))

    api = Evo2API(api_path="/evo2")
    server = ls.LitServer(
        api,
        accelerator="cuda",
        devices=1,
        workers_per_device=1,
    )
    server.run(host="0.0.0.0", port=port, log_level="info", generate_client_file=False)
