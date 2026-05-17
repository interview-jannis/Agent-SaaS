import zipfile
import xml.etree.ElementTree as ET

with zipfile.ZipFile('products_master_v25.xlsx', 'r') as z:
    # Get shared strings
    sst = ET.fromstring(z.read('xl/sharedStrings.xml'))
    strings = []
    for si in sst.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si'):
        text_parts = []
        for t in si.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t'):
            if t.text:
                text_parts.append(t.text)
        strings.append(''.join(text_parts))
    
    # Get sheet 6 (Subpackage)
    sheet = ET.fromstring(z.read('xl/worksheets/sheet6.xml'))
    
    rows_data = []
    for row in sheet.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row'):
        row_cells = []
        for cell in row.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
            v = cell.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
            t_attr = cell.get('t')
            
            if v is not None and v.text:
                if t_attr == 's':
                    idx = int(v.text)
                    row_cells.append(strings[idx] if idx < len(strings) else '')
                else:
                    row_cells.append(v.text)
            else:
                row_cells.append('')
        rows_data.append(row_cells)

# Print headers and data
print("COLUMN HEADERS:")
if rows_data:
    headers = rows_data[0]
    for i, h in enumerate(headers):
        print(f"{i:2d}. {h}")
    
    print("\n" + "="*180)
    print("SUBPACKAGE DATA (All rows):\n")
    
    for row_idx, row in enumerate(rows_data[1:], start=2):
        print(f"Row {row_idx}: ", end="")
        for col_idx, (header, value) in enumerate(zip(headers, row)):
            if header in ['product_number', 'partner_name', 'name', 'variant_label', 'grade', 'base_price', 'price_currency', 'price_min', 'price_max', 'duration_value', 'duration_unit', 'is_active']:
                print(f"{header}={value} | ", end="")
        print()
    
    print("\n" + "="*180)
    print("\nDETAILED VIEW (All rows with all columns):\n")
    
    for row_idx, row in enumerate(rows_data[1:], start=2):
        print(f"\n--- Row {row_idx} ---")
        for col_idx, (header, value) in enumerate(zip(headers, row)):
            if value:  # Only print non-empty cells
                print(f"{header}: {value}")

