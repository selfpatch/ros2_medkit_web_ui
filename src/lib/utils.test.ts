import { describe, it, expect } from 'vitest';
import { cn, formatBytes, formatDuration, mapFaultEntityTypeToResourceType } from './utils';

describe('cn utility', () => {
    it('merges class names', () => {
        expect(cn('foo', 'bar')).toBe('foo bar');
    });

    it('handles conditional classes', () => {
        const condition = false;
        expect(cn('foo', condition && 'bar', 'baz')).toBe('foo baz');
    });

    it('merges tailwind classes correctly', () => {
        expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
    });

    it('handles empty input', () => {
        expect(cn()).toBe('');
    });

    it('handles arrays', () => {
        expect(cn(['foo', 'bar'])).toBe('foo bar');
    });
});

describe('formatBytes', () => {
    it('formats zero bytes', () => expect(formatBytes(0)).toBe('0 B'));
    it('formats kilobytes', () => expect(formatBytes(1536)).toBe('1.5 KB'));
    it('formats megabytes', () => expect(formatBytes(1048576)).toBe('1 MB'));
});

describe('formatDuration', () => {
    it('formats seconds under a minute', () => expect(formatDuration(30)).toBe('30.0s'));
    it('formats minutes and seconds', () => expect(formatDuration(90)).toBe('1m 30s'));
});

describe('mapFaultEntityTypeToResourceType', () => {
    it('maps singular to plural', () => {
        expect(mapFaultEntityTypeToResourceType('app')).toBe('apps');
        expect(mapFaultEntityTypeToResourceType('component')).toBe('components');
        expect(mapFaultEntityTypeToResourceType('area')).toBe('areas');
        expect(mapFaultEntityTypeToResourceType('function')).toBe('functions');
    });
    it('passes through plural forms', () => expect(mapFaultEntityTypeToResourceType('apps')).toBe('apps'));
    it('defaults to components for unknown', () =>
        expect(mapFaultEntityTypeToResourceType('unknown')).toBe('components'));
});
