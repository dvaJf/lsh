from .minhash import jaccard_similarity


def exact_search(documents, query_shingles, threshold=0.5):
    results = []
    for doc_id, doc in list(documents.items()):
        sim = jaccard_similarity(query_shingles, doc["shingles"])
        if sim >= threshold:
            results.append({
                "id": doc_id,
                "score": round(sim, 4),
                "metadata": doc.get("metadata", {}),
            })
    results.sort(key=lambda x: x["score"], reverse=True)
    return results


def evaluate(lsh_results, exact_results, time_lsh_ms, time_exact_ms):
    lsh_ids = set()
    for r in lsh_results:
        lsh_ids.add(r["id"])

    exact_ids = set()
    for r in exact_results:
        exact_ids.add(r["id"])

    tp = len(lsh_ids & exact_ids)

    recall = round(tp / len(exact_ids), 3) if exact_ids else 1.0
    precision = round(tp / len(lsh_ids), 3) if lsh_ids else 1.0
    speedup = round(time_exact_ms / time_lsh_ms, 2) if time_lsh_ms > 0 else 1.0

    return {
        "recall": recall,
        "precision": precision,
        "speedup": max(1.0, speedup),
        "time_lsh_ms": round(time_lsh_ms, 3),
        "time_exact_ms": round(time_exact_ms, 3),
    }
