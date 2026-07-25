import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isValidImportEmail,
  isValidImportPhone,
  mapUserHeaderRow,
  normalizePhone,
  parseUserType,
  parseZoneNames,
  USER_HEADER_ALIASES,
} from './users-excel.util';
import * as ExcelJS from 'exceljs';

describe('users-excel util', () => {
  it('validates email and VN phone', () => {
    assert.equal(isValidImportEmail('a@b.com'), true);
    assert.equal(isValidImportEmail('bad'), false);
    assert.equal(isValidImportPhone('0912345678'), true);
    assert.equal(isValidImportPhone('+84912345678'), true);
    assert.equal(isValidImportPhone('0123456789'), false);
    assert.equal(normalizePhone('0912 345 678'), '0912345678');
  });

  it('parses userType aliases', () => {
    assert.equal(parseUserType('EMPLOYEE'), 'EMPLOYEE');
    assert.equal(parseUserType('khach'), 'VISITOR');
    assert.equal(parseUserType('contractor'), 'CONTRACTOR');
    assert.equal(parseUserType('xyz'), null);
  });

  it('parses multiple zone names', () => {
    assert.deepEqual(parseZoneNames('Cổng chính; Văn phòng'), ['Cổng chính', 'Văn phòng']);
    assert.deepEqual(parseZoneNames('A, B | C'), ['A', 'B', 'C']);
    assert.deepEqual(parseZoneNames('  '), []);
  });

  it('maps VN headers including Anh and Khu vuc', () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('t');
    sheet.addRow([
      'Mã NV',
      'Họ tên',
      'Email',
      'Số điện thoại',
      'Phòng ban',
      'Loại NV',
      'Ảnh',
      'Khu vực',
    ]);
    const map = mapUserHeaderRow(sheet.getRow(1));
    assert.equal(map.employeeCode, 1);
    assert.equal(map.fullName, 2);
    assert.equal(map.email, 3);
    assert.equal(map.phone, 4);
    assert.equal(map.department, 5);
    assert.equal(map.userType, 6);
    assert.equal(map.faceImage, 7);
    assert.equal(map.zones, 8);
    assert.ok(USER_HEADER_ALIASES.fullName.includes('ho ten'));
  });
});
