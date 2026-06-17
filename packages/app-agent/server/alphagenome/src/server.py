import logging
import os

import litserve as ls

from api import AlphaGenomeAPI

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)

_DEFAULT_PORT = 8002

if __name__ == "__main__":
    port = int(os.environ.get("AG_PORT", _DEFAULT_PORT))

    api = AlphaGenomeAPI(api_path="/alphagenome")
    server = ls.LitServer(
        api,
        accelerator="cuda",
        devices=1,
        workers_per_device=1,
    )
    server.run(host="0.0.0.0", port=port, log_level="info")
