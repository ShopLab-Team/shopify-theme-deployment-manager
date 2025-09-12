const { parseMultilineInput, parseBoolean } = require('../config');

describe('config utilities', () => {
  describe('parseMultilineInput', () => {
    it('should parse multiline string into array', () => {
      const input = `line1
      line2
      line3`;
      const result = parseMultilineInput(input);
      expect(result).toEqual(['line1', 'line2', 'line3']);
    });

    it('should filter empty lines', () => {
      const input = `line1

      line2
      
      `;
      const result = parseMultilineInput(input);
      expect(result).toEqual(['line1', 'line2']);
    });

    it('should handle empty input', () => {
      expect(parseMultilineInput('')).toEqual([]);
      expect(parseMultilineInput(null)).toEqual([]);
      expect(parseMultilineInput(undefined)).toEqual([]);
    });

    it('should trim whitespace from lines', () => {
      const input = `  line1  
        line2    
      line3`;
      const result = parseMultilineInput(input);
      expect(result).toEqual(['line1', 'line2', 'line3']);
    });
  });

  describe('parseBoolean', () => {
    it('should parse string true to boolean', () => {
      expect(parseBoolean('true')).toBe(true);
      expect(parseBoolean(true)).toBe(true);
    });

    it('should parse string false to boolean', () => {
      expect(parseBoolean('false')).toBe(false);
      expect(parseBoolean(false)).toBe(false);
      expect(parseBoolean('')).toBe(false);
      expect(parseBoolean(null)).toBe(false);
      expect(parseBoolean(undefined)).toBe(false);
    });

    it('should treat any non-true value as false', () => {
      expect(parseBoolean('yes')).toBe(false);
      expect(parseBoolean('1')).toBe(false);
    });

    it('should handle case-insensitive true', () => {
      expect(parseBoolean('TRUE')).toBe(true);
      expect(parseBoolean('True')).toBe(true);
      expect(parseBoolean('TrUe')).toBe(true);
    });
  });
});
