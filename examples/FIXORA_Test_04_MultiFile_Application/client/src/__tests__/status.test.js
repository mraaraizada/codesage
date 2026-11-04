import{describe,it,expect}from'vitest';import{statusLabel}from'../utils/status.js';
describe('status label mapping',()=>{it('preserves completed status',()=>expect(statusLabel('completed')).toBe('completed'));it('preserves pending status',()=>expect(statusLabel('pending')).toBe('pending'))});
