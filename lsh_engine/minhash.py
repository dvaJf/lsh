import random
import re


def get_shingles(text, k=2):
    words = re.findall(r"\w+", text.lower())
    if len(words) < k:
        return set(words)
    shingles = set()
    for i in range(len(words) - k + 1):
        shingles.add(words[i] + " " + words[i + 1])
    return shingles


def jaccard_similarity(a, b):
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


class MinHash:
    def __init__(self, num_hashes=64):
        self.num_hashes = num_hashes
        self.prime = 4294967311
        self.coeffs = []
        for _ in range(num_hashes):
            a = random.randint(1, self.prime - 1)
            b = random.randint(0, self.prime - 1)
            self.coeffs.append((a, b))

    def compute_signature(self, shingles):
        if not shingles:
            return [0] * self.num_hashes
        hashes = []
        for s in shingles:
            hashes.append(abs(hash(s)))
        sig = []
        for a, b in self.coeffs:
            min_val = min((a * h + b) % self.prime for h in hashes)
            sig.append(min_val)
        return sig


class MinHashLSH:
    def __init__(self, b=16, r=4):
        self.b = b
        self.r = r
        self.threshold = (1.0 / b) ** (1.0 / r)
        self.minhash = MinHash(num_hashes=b * r)
        self.documents = {}
        self.buckets = {}

    def insert(self, doc_id, shingles, metadata=None):
        if metadata is None:
            metadata = {}
        self.documents[doc_id] = {"shingles": shingles, "metadata": metadata}
        sig = self.minhash.compute_signature(shingles)

        for band in range(self.b):
            band_sig = tuple(sig[band * self.r : (band + 1) * self.r])
            key = (band, hash(band_sig))
            if key not in self.buckets:
                self.buckets[key] = []
            self.buckets[key].append(doc_id)

    def query(self, query_shingles, threshold=0.5):
        sig = self.minhash.compute_signature(query_shingles)
        candidates = set()

        for band in range(self.b):
            band_sig = tuple(sig[band * self.r : (band + 1) * self.r])
            key = (band, hash(band_sig))
            if key in self.buckets:
                for doc_id in self.buckets[key]:
                    candidates.add(doc_id)

        results = []
        for doc_id in candidates:
            sim = jaccard_similarity(query_shingles, self.documents[doc_id]["shingles"])
            if sim >= threshold:
                results.append({
                    "id": doc_id,
                    "score": round(sim, 4),
                    "metadata": self.documents[doc_id]["metadata"],
                })

        results.sort(key=lambda x: x["score"], reverse=True)
        return results

    def get_buckets_info(self):
        info = []
        for band in range(min(self.b, 8)):
            count = 0
            for b, _ in self.buckets:
                if b == band:
                    count += 1
            info.append({
                "table_index": band,
                "num_buckets": count,
                "non_empty_buckets": count,
            })
        return info
