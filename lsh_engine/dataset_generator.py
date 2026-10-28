import os
import json


def load_docs():
    path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'real_documents.json')
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []
