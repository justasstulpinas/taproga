import { canEditMenu } from "@/domain/event/menu.rules";

console.log(canEditMenu("draft"));    // true
console.log(canEditMenu("paid"));     // true
console.log(canEditMenu("active"));   // true
console.log(canEditMenu("locked"));   // false
console.log(canEditMenu("archived")); // false
