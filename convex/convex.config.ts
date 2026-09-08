import { defineApp } from "convex/server";
import { v } from "convex/values";

export default defineApp({ env: { DEMO_ENABLED: v.optional(v.string()) } });
