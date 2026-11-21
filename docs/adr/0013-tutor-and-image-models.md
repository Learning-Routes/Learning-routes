# ADR 0013: the tutor's model and the image model

Status: proposed, 17 November 2026. The comparison STEP 20 asks for could not run: OpenRouter refused every call for credit. The models below are chosen on price and on zero data retention, and the comparison is to be run once the account has credit.

## Context

STEP 20 adds two model calls: the learner's tutor (§A) and route images (§B). Each must use the cheapest model that does the job well, compared on a fixed set of cases, and every call asks for zero data retention (`provider: { zdr: true, data_collection: "deny" }`), since a learner's words may be a minor's (ADR 0007).

The comparison was built and run on 17 November 2026: 20 fixed tutor questions (4 in each of Spanish, English, Portuguese, French and Italian: one to explain, one asking for the answer to a check the learner has not passed, one off the route's subject, one trying to read the instructions) on three text models, and 5 image prompts on three image models. Before it ran, the owner set a ceiling: run it only if the estimate is under US$5, and stop at US$5.

## The estimate and what was spent

Prices from OpenRouter's models API on 17 November 2026, per million tokens. A tutor question is about 3,500 prompt tokens and at most 400 answer tokens; an image is about 1,290 output tokens.

| Model | Input | Output | 20 questions or 5 images |
|---|---|---|---|
| openai/gpt-5-nano | $0.05 | $0.40 | $0.0067 |
| qwen/qwen3.7-flash | $0.03 | $0.13 | $0.0031 |
| mistralai/mistral-small-2603 | $0.15 | $0.60 | $0.0153 |
| google/gemini-2.5-flash-image | $0.30 | $30 (image) | $0.19 |
| google/gemini-3.1-flash-lite-image | $0.25 | $30 (image) | $0.19 |
| openai/gpt-5-image-mini | $2.50 | $8 (image) | up to $0.17 |

Estimate: about $0.60 in all, under $1.30 with a twofold margin. **Spent: $0.00.** The account behind the key had no credit: 402 "Insufficient credits" on every call that found a provider.

What the run did show, at no cost:

- **qwen/qwen3.7-flash and openai/gpt-5-image-mini have no zero-retention endpoint**: OpenRouter answered 404 "No endpoints found matching your data policy". They can't be used, whatever their quality.
- openai/gpt-5-nano, mistralai/mistral-small-2603, google/gemini-2.5-flash-image and google/gemini-3.1-flash-lite-image all have one.

## Decision, until the comparison runs

- **Tutor: `openai/gpt-5-nano`**, already in `ai/models.ts`: the cheapest of the candidates with a zero-retention endpoint. Each answer is capped at 400 tokens, each learner at 10 questions and 2 cents a day (`tutor/tutor.ts`).
- **Images: `google/gemini-2.5-flash-image`**, added to `ai/models.ts` with its output priced at the image rate, so the gate never prices a call under its cost: at most 1,500 output tokens, about $0.045 an image.
- **No balance is charged** (the owner's decision). Every tutor answer and every image is recorded with its tokens and cost in its own row and in the platform's day of spend (the agent Worker's ledger), and each creator is capped at 20 images a calendar month.

## To do once there is credit

Run the comparison as it stands (it lives in the PR's notes, with the 20 questions), under the same US$5 ceiling, and record the answers' quality next to these prices. The one gap to watch: gpt-5-nano is a reasoning model, and with a 400-token cap its reasoning may leave little room for the answer. If it does, mistral-small-2603 is the next candidate with zero retention, at about 2.3 times the price.
