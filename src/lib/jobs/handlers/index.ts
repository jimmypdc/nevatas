// Aggregator that imports each handler module for its registration side
// effect. Add new handlers here as they're built.

import "@/lib/jobs/handlers/scan-file";
import "@/lib/jobs/handlers/send-email";
import "@/lib/jobs/handlers/payroll-sync";
