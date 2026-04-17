// Lazy-load controllers on first appearance of their data-controller attribute.
// Saves ~350KB of JS on pages that use a small subset of controllers.
import { application } from "controllers/application"
import { lazyLoadControllersFrom } from "@hotwired/stimulus-loading"
lazyLoadControllersFrom("controllers", application)
