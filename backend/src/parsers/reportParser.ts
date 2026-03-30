import * as XLSX from 'xlsx';
import {
  SearchTermReportRow,
  TargetingReportRow,
  AdvertisedProductReportRow,
  PurchasedProductReportRow,
  ParsedReports,
} from '../types';
import { normalizeNumber, normalizePercentage } from '../utils/productGroup';

/**
 * Parse Search Term Report Excel file
 */
export function parseSearchTermReport(filePath: string): SearchTermReportRow[] {
  console.log('📄 Parsing Search Term Report...');

  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Convert to JSON with header row
  const rawData: any[] = XLSX.utils.sheet_to_json(worksheet);

  console.log(`  - Found ${rawData.length} rows`);

  // Map and normalize data
  const data: SearchTermReportRow[] = rawData.map((row) => ({
    'Start Date': row['Start Date'] || '',
    'End Date': row['End Date'] || '',
    'Portfolio name': row['Portfolio name'] || '',
    'Currency': row['Currency'] || 'USD',
    'Campaign Name': row['Campaign Name'] || '',
    'Ad Group Name': row['Ad Group Name'] || '',
    'Retailer': row['Retailer'] || '',
    'Country': row['Country'] || 'US',
    'Targeting': row['Targeting'] || '',
    'Match Type': row['Match Type'] || '',
    'Customer Search Term': row['Customer Search Term'] || '',
    'Impressions': normalizeNumber(row['Impressions']),
    'Clicks': normalizeNumber(row['Clicks']),
    'Click-Thru Rate (CTR)': normalizePercentage(row['Click-Thru Rate (CTR)']),
    'Cost Per Click (CPC)': normalizeNumber(row['Cost Per Click (CPC)']),
    'Spend': normalizeNumber(row['Spend']),
    '7 Day Total Sales': normalizeNumber(row['7 Day Total Sales '] || row['7 Day Total Sales']),
    'Total Advertising Cost of Sales (ACOS)': normalizePercentage(row['Total Advertising Cost of Sales (ACOS)']),
    'Total Return on Advertising Spend (ROAS)': normalizeNumber(row['Total Return on Advertising Spend (ROAS)']),
    '7 Day Total Orders (#)': normalizeNumber(row['7 Day Total Orders (#)']),
    '7 Day Total Units (#)': normalizeNumber(row['7 Day Total Units (#)']),
    '7 Day Conversion Rate': normalizePercentage(row['7 Day Conversion Rate']),
    '7 Day Advertised SKU Units (#)': normalizeNumber(row['7 Day Advertised SKU Units (#)']),
    '7 Day Other SKU Units (#)': normalizeNumber(row['7 Day Other SKU Units (#)']),
    '7 Day Advertised SKU Sales': normalizeNumber(row['7 Day Advertised SKU Sales '] || row['7 Day Advertised SKU Sales']),
    '7 Day Other SKU Sales': normalizeNumber(row['7 Day Other SKU Sales '] || row['7 Day Other SKU Sales']),
  }));

  return data;
}

/**
 * Parse Targeting Report Excel file
 */
export function parseTargetingReport(filePath: string): TargetingReportRow[] {
  console.log('📄 Parsing Targeting Report...');

  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  const rawData: any[] = XLSX.utils.sheet_to_json(worksheet);

  console.log(`  - Found ${rawData.length} rows`);

  const data: TargetingReportRow[] = rawData.map((row) => ({
    'Start Date': row['Start Date'] || '',
    'End Date': row['End Date'] || '',
    'Portfolio name': row['Portfolio name'] || '',
    'Currency': row['Currency'] || 'USD',
    'Campaign Name': row['Campaign Name'] || '',
    'Ad Group Name': row['Ad Group Name'] || '',
    'Retailer': row['Retailer'] || '',
    'Country': row['Country'] || 'US',
    'Targeting': row['Targeting'] || '',
    'Match Type': row['Match Type'] || '',
    'Top-of-search Impression Share': normalizePercentage(row['Top-of-search Impression Share']),
    'Impressions': normalizeNumber(row['Impressions']),
    'Clicks': normalizeNumber(row['Clicks']),
    'Click-Thru Rate (CTR)': normalizePercentage(row['Click-Thru Rate (CTR)']),
    'Cost Per Click (CPC)': normalizeNumber(row['Cost Per Click (CPC)']),
    'Spend': normalizeNumber(row['Spend']),
    '7 Day Total Sales': normalizeNumber(row['7 Day Total Sales '] || row['7 Day Total Sales']),
    'Total Advertising Cost of Sales (ACOS)': normalizePercentage(row['Total Advertising Cost of Sales (ACOS)']),
    'Total Return on Advertising Spend (ROAS)': normalizeNumber(row['Total Return on Advertising Spend (ROAS)']),
    '7 Day Total Orders (#)': normalizeNumber(row['7 Day Total Orders (#)']),
    '7 Day Total Units (#)': normalizeNumber(row['7 Day Total Units (#)']),
    '7 Day Conversion Rate': normalizePercentage(row['7 Day Conversion Rate']),
    '7 Day Advertised SKU Units (#)': normalizeNumber(row['7 Day Advertised SKU Units (#)']),
    '7 Day Other SKU Units (#)': normalizeNumber(row['7 Day Other SKU Units (#)']),
    '7 Day Advertised SKU Sales': normalizeNumber(row['7 Day Advertised SKU Sales '] || row['7 Day Advertised SKU Sales']),
    '7 Day Other SKU Sales': normalizeNumber(row['7 Day Other SKU Sales '] || row['7 Day Other SKU Sales']),
  }));

  return data;
}

/**
 * Parse Advertised Product Report Excel file
 */
export function parseAdvertisedProductReport(filePath: string): AdvertisedProductReportRow[] {
  console.log('📄 Parsing Advertised Product Report...');

  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  const rawData: any[] = XLSX.utils.sheet_to_json(worksheet);

  console.log(`  - Found ${rawData.length} rows`);

  const data: AdvertisedProductReportRow[] = rawData.map((row) => ({
    'Start Date': row['Start Date'] || '',
    'End Date': row['End Date'] || '',
    'Portfolio name': row['Portfolio name'] || '',
    'Currency': row['Currency'] || 'USD',
    'Campaign Name': row['Campaign Name'] || '',
    'Ad Group Name': row['Ad Group Name'] || '',
    'Retailer': row['Retailer'] || '',
    'Country': row['Country'] || 'US',
    'Advertised SKU': row['Advertised SKU'] || '',
    'Advertised ASIN': row['Advertised ASIN'] || '',
    'Impressions': normalizeNumber(row['Impressions']),
    'Clicks': normalizeNumber(row['Clicks']),
    'Click-Thru Rate (CTR)': normalizePercentage(row['Click-Thru Rate (CTR)']),
    'Cost Per Click (CPC)': normalizeNumber(row['Cost Per Click (CPC)']),
    'Spend': normalizeNumber(row['Spend']),
    '7 Day Total Sales': normalizeNumber(row['7 Day Total Sales '] || row['7 Day Total Sales']),
    'Total Advertising Cost of Sales (ACOS)': normalizePercentage(row['Total Advertising Cost of Sales (ACOS)']),
    'Total Return on Advertising Spend (ROAS)': normalizeNumber(row['Total Return on Advertising Spend (ROAS)']),
    '7 Day Total Orders (#)': normalizeNumber(row['7 Day Total Orders (#)']),
    '7 Day Total Units (#)': normalizeNumber(row['7 Day Total Units (#)']),
    '7 Day Conversion Rate': normalizePercentage(row['7 Day Conversion Rate']),
    '7 Day Advertised SKU Units (#)': normalizeNumber(row['7 Day Advertised SKU Units (#)']),
    '7 Day Other SKU Units (#)': normalizeNumber(row['7 Day Other SKU Units (#)']),
    '7 Day Advertised SKU Sales': normalizeNumber(row['7 Day Advertised SKU Sales '] || row['7 Day Advertised SKU Sales']),
    '7 Day Other SKU Sales': normalizeNumber(row['7 Day Other SKU Sales '] || row['7 Day Other SKU Sales']),
  }));

  return data;
}

/**
 * Parse Purchased Product Report Excel file
 */
export function parsePurchasedProductReport(filePath: string): PurchasedProductReportRow[] {
  console.log('📄 Parsing Purchased Product Report...');

  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  const rawData: any[] = XLSX.utils.sheet_to_json(worksheet);

  console.log(`  - Found ${rawData.length} rows`);

  const data: PurchasedProductReportRow[] = rawData.map((row) => ({
    'Start Date': row['Start Date'] || '',
    'End Date': row['End Date'] || '',
    'Portfolio name': row['Portfolio name'] || '',
    'Currency': row['Currency'] || 'USD',
    'Campaign Name': row['Campaign Name'] || '',
    'Ad Group Name': row['Ad Group Name'] || '',
    'Advertised SKU': row['Advertised SKU'] || '',
    'Advertised ASIN': row['Advertised ASIN'] || '',
    'Purchased ASIN': row['Purchased ASIN'] || '',
    'Targeting': row['Targeting'] || '',
    'Match Type': row['Match Type'] || '',
    '7 Day Other SKU Units (#)': normalizeNumber(row['7 Day Other SKU Units (#)']),
    '7 Day Other SKU Orders (#)': normalizeNumber(row['7 Day Other SKU Orders (#)']),
    '7 Day Other SKU Sales': normalizeNumber(row['7 Day Other SKU Sales '] || row['7 Day Other SKU Sales']),
  }));

  return data;
}

/**
 * Parse all reports (3 required + 1 optional)
 */
export function parseAllReports(
  searchTermPath: string,
  targetingPath: string,
  advertisedProductPath: string,
  purchasedProductPath?: string
): ParsedReports {
  console.log('\n🚀 Starting report parsing...\n');

  const searchTermReport = parseSearchTermReport(searchTermPath);
  const targetingReport = parseTargetingReport(targetingPath);
  const advertisedProductReport = parseAdvertisedProductReport(advertisedProductPath);
  const purchasedProductReport = purchasedProductPath ? parsePurchasedProductReport(purchasedProductPath) : undefined;

  console.log('\n✅ All reports parsed successfully!\n');
  console.log('Summary:');
  console.log(`  - Search Term rows: ${searchTermReport.length}`);
  console.log(`  - Targeting rows: ${targetingReport.length}`);
  console.log(`  - Advertised Product rows: ${advertisedProductReport.length}`);
  if (purchasedProductReport) {
    console.log(`  - Purchased Product rows: ${purchasedProductReport.length}`);
  }
  console.log('');

  return {
    searchTermReport,
    targetingReport,
    advertisedProductReport,
    purchasedProductReport,
  };
}
