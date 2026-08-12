"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const jobFetcher_1 = require("./services/jobFetcher");
async function test() {
    console.log('Testing Job Sourcing Engine...');
    const stats = await (0, jobFetcher_1.runJobSourcingPipeline)();
    console.log('Stats:', stats);
}
test();
