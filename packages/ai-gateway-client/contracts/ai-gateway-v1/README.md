# ADS AI Gateway contract v1: shared JSON schemas

Requests, responses, streaming events and errors of the ADS AI Gateway contract v1, exactly as the
ADS Agentic and RAG Integration Standard v1 §5 and §6.5 specify. One set of schemas is asserted
against BOTH the real gateway (`tests/ai-gateway/contract.test.ts`) and the ads-platform-kit
mock facade and client (`packages/ai-gateway-client/contracts/ai-gateway-v1`, a byte-identical
copy), so the two cannot drift. The drift test fails if the copies differ.

Supported keywords are the subset implemented by `gateway/src/schema/json-schema.ts`.
