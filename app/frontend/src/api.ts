import axios from "axios";

const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8000";

export const client = axios.create({
  baseURL: backendUrl,
  timeout: 20000,
});

export async function fetchTopics(): Promise<string[]> {
  const resp = await client.get("/api/topics");
  return resp.data;
}

export async function fetchAnalysis(topic: string) {
  const resp = await client.get(`/api/topic/${topic}/analysis`);
  return resp.data;
}

export async function fetchComparison(topic: string) {
  const resp = await client.get(`/api/topic/${topic}/comparison`);
  return resp.data;
}

export async function fetchGraphs(topic: string) {
  const resp = await client.get(`/api/topic/${topic}/graphs`);
  return resp.data;
}

export async function fetchEmbeddings(topic: string) {
  const resp = await client.get(`/api/topic/${topic}/embeddings`);
  return resp.data;
}

export async function fetchRaw(topic: string) {
  const resp = await client.get(`/api/topic/${topic}/raw`);
  return resp.data;
}

export async function fetchSegments(topic: string) {
  const resp = await client.get(`/api/topic/${topic}/segments`);
  return resp.data;
}

export async function searchTopic(topic: string, query: string, kind: "entity" | "relation" | "claim" = "entity") {
  const resp = await client.get(`/api/topic/${topic}/search`, { params: { query, kind } });
  return resp.data;
}

export async function triggerRecompute(topic: string) {
  const resp = await client.post(`/api/topic/${topic}/recompute`);
  return resp.data;
}
