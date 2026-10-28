import time
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import uvicorn

from lsh_engine import MinHashLSH, get_shingles, exact_search, evaluate, load_docs

docs = []
lsh = None
b = 16
r = 4
k_shingle = 2


def build_index():
    global lsh
    lsh = MinHashLSH(b=b, r=r)
    for doc in docs:
        sh = get_shingles(doc["text"], k=k_shingle)
        lsh.insert(
            doc["id"],
            sh,
            metadata={
                "title": doc["title"],
                "text": doc["text"],
                "category": doc.get("category", "Общее"),
                "type": doc.get("type", "Оригинал"),
            },
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    global docs
    docs = load_docs()
    build_index()
    yield


app = FastAPI(title="MinHash LSH", lifespan=lifespan)
app.mount("/static", StaticFiles(directory="static"), name="static")


class QueryTextRequest(BaseModel):
    query_text: str = ""
    threshold: float = 0.6


class RebuildRequest(BaseModel):
    b: int = 16
    r: int = 4
    k_shingle: int = 2


@app.get("/")
def home():
    return FileResponse("templates/index.html")


@app.get("/api/state")
def get_state():
    return {
        "minhash": {
            "params": {"b": b, "r": r, "k_shingle": k_shingle, "threshold": 0.6},
            "doc_count": len(docs),
            "threshold_theory": round(lsh.threshold, 3) if lsh else 0.5,
            "sample_text": docs[0]["text"] if docs else "",
            "tables_info": lsh.get_buckets_info() if lsh else {},
        }
    }


@app.post("/api/minhash/query")
def search_text(req: QueryTextRequest):
    query_text = req.query_text.strip()
    if not query_text and docs:
        query_text = docs[0]["text"]

    shingles = get_shingles(query_text, k=k_shingle)

    t0 = time.perf_counter()
    lsh_res = lsh.query(shingles, threshold=req.threshold)
    t_lsh_ms = (time.perf_counter() - t0) * 1000

    t1 = time.perf_counter()
    exact_res = exact_search(lsh.documents, shingles, threshold=req.threshold)
    t_exact_ms = (time.perf_counter() - t1) * 1000

    metrics = evaluate(lsh_res, exact_res, t_lsh_ms, t_exact_ms)

    return {
        "query_text_snippet": query_text[:100] + "...",
        "metrics": metrics,
        "lsh_results": lsh_res[:100],
        "exact_results": exact_res[:100],
    }


@app.post("/api/minhash/rebuild")
def rebuild(req: RebuildRequest):
    global b, r, k_shingle
    b = req.b
    r = req.r
    k_shingle = req.k_shingle
    build_index()
    return {"status": "ok", "threshold": round(lsh.threshold, 3)}


@app.get("/api/presets")
def get_presets():
    doc_main = docs[0]["text"] if docs else ""
    title_main = docs[0]["title"] if docs else "Статья"
    doc_rewrite = docs[15]["text"] if len(docs) > 15 else doc_main
    other_idx = 488 if len(docs) > 488 else len(docs) - 1
    doc_other = docs[other_idx]["text"] if docs else ""
    title_other = docs[other_idx]["title"] if docs else ""

    return {
        "minhash": [
            {
                "id": "exact",
                "title": f"Оригинал: {title_main} (сходство ~100%)",
                "text": doc_main,
                "threshold": 0.75,
            },
            {
                "id": "partial",
                "title": f"Пересказ: {title_main} (сходство ~60%)",
                "text": doc_rewrite,
                "threshold": 0.45,
            },
            {
                "id": "unrelated",
                "title": f"Другая статья: {title_other} (<10%)",
                "text": doc_other,
                "threshold": 0.4,
            },
        ]
    }


@app.get("/api/documents")
def get_documents(search: str = ""):
    s = search.lower().strip()
    items = []
    for d in docs:
        if (
            s
            and s not in d["title"].lower()
            and s not in d["text"].lower()
            and s not in d.get("category", "").lower()
        ):
            continue
        items.append(
            {
                "id": d["id"],
                "title": d["title"],
                "text": d["text"],
                "category": d.get("category", "Общее"),
                "type": d.get("type", "Оригинал"),
                "words_count": d.get("words_count", len(d["text"].split())),
            }
        )
    return {"type": "minhash", "total": len(items), "items": items}


@app.post("/api/generate_dataset")
def gen_data():
    global docs
    docs = load_docs()
    build_index()
    return {"status": "ok"}


if __name__ == "__main__":
    print("Запуск сервера: http://127.0.0.1:5000")
    uvicorn.run("app:app", host="127.0.0.1", port=5000, reload=False)
