# minilm_embed.py
# Usage: python3 minilm_embed.py '["text1", "text2"]' model_name dim
# Outputs: JSON array of vectors
import sys, json
try:
    from sentence_transformers import SentenceTransformer
except ImportError:
    print(json.dumps([[0.0]*int(sys.argv[3])] * len(json.loads(sys.argv[1]))))
    sys.exit(0)
texts = json.loads(sys.argv[1])
model_name = sys.argv[2]
dim = int(sys.argv[3])
try:
    model = SentenceTransformer(model_name)
    vectors = model.encode(texts)
    # Ensure output is list of lists of floats
    vectors = [list(map(float, v[:dim])) for v in vectors]
    print(json.dumps(vectors))
except Exception as e:
    print(json.dumps([[0.0]*dim]*len(texts)))
    sys.exit(0)
