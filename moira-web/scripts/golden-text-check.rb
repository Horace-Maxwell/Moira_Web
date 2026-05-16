#!/usr/bin/env ruby
# frozen_string_literal: true

require "digest"
require "fileutils"
require "json"
require "net/http"
require "time"
require "uri"

ROOT_DIR = File.expand_path("..", __dir__)
FIXTURE_PATH = File.join(ROOT_DIR, "fixtures", "golden", "chart-text.json")

DEFAULT_CASES = [
  {
    "id" => "traditional-shanghai-dhx",
    "description" => "七政四余星盘 baseline using the legacy DHX Shanghai sample.",
    "request" => {
      "mode" => "traditional",
      "name" => "DHX",
      "sex" => "male",
      "birthDate" => "2006-04-10",
      "birthTime" => "09:58",
      "nowDate" => "2026-04-09",
      "nowTime" => "12:30",
      "country" => "中国",
      "city" => "上海",
      "zone" => "Asia/Shanghai",
      "imageWidth" => "720",
      "imageHeight" => "540"
    }
  },
  {
    "id" => "pick-shanghai-dhx",
    "description" => "天星择日 baseline using the legacy DHX Shanghai sample.",
    "request" => {
      "mode" => "pick",
      "name" => "DHX",
      "sex" => "male",
      "birthDate" => "2006-04-10",
      "birthTime" => "09:58",
      "nowDate" => "2026-04-09",
      "nowTime" => "12:30",
      "country" => "中国",
      "city" => "上海",
      "zone" => "Asia/Shanghai",
      "imageWidth" => "720",
      "imageHeight" => "540"
    }
  },
  {
    "id" => "western-shanghai-dhx",
    "description" => "占星盘 baseline using the legacy DHX Shanghai sample.",
    "request" => {
      "mode" => "western",
      "name" => "DHX",
      "sex" => "male",
      "birthDate" => "2006-04-10",
      "birthTime" => "09:58",
      "nowDate" => "2026-04-09",
      "nowTime" => "12:30",
      "country" => "中国",
      "city" => "上海",
      "zone" => "Asia/Shanghai",
      "imageWidth" => "720",
      "imageHeight" => "540"
    }
  },
  {
    "id" => "sidereal-shanghai-dhx",
    "description" => "郑氏星案 baseline using the legacy DHX Shanghai sample.",
    "request" => {
      "mode" => "sidereal",
      "name" => "DHX",
      "sex" => "male",
      "birthDate" => "2006-04-10",
      "birthTime" => "09:58",
      "nowDate" => "2026-04-09",
      "nowTime" => "12:30",
      "country" => "中国",
      "city" => "上海",
      "zone" => "Asia/Shanghai",
      "imageWidth" => "720",
      "imageHeight" => "540"
    }
  }
].freeze

def usage
  warn "Usage: #{$PROGRAM_NAME} [--update] [--fixture PATH] BASE_URL"
  exit 2
end

update = false
fixture_path = FIXTURE_PATH
args = ARGV.dup
until args.empty?
  case args.first
  when "--update"
    update = true
    args.shift
  when "--fixture"
    args.shift
    fixture_path = args.shift || usage
  when "-h", "--help"
    usage
  else
    break
  end
end

base_url = args.shift || "http://127.0.0.1:8080"
usage unless args.empty?

def normalize_text(value)
  value.to_s.gsub("\r\n", "\n").gsub("\r", "\n")
end

def sha256(value)
  Digest::SHA256.hexdigest(normalize_text(value))
end

def compute_chart(base_url, request)
  uri = URI.join(base_url.end_with?("/") ? base_url : "#{base_url}/", "api/chart/compute")
  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = uri.scheme == "https"
  http.open_timeout = 10
  http.read_timeout = 90
  response = http.post(uri.request_uri, JSON.generate(request), {
    "Accept" => "application/json",
    "Content-Type" => "application/json"
  })
  unless response.is_a?(Net::HTTPSuccess)
    raise "POST #{uri} failed with HTTP #{response.code}: #{response.body}"
  end
  JSON.parse(response.body)
end

def expected_payload(payload)
  text_pages = payload.fetch("textPages", {})
  {
    "packedEntry" => normalize_text(payload.fetch("packedEntry", "")),
    "textPages" => {
      "calculation" => normalize_text(text_pages.fetch("calculation", "")),
      "eightCharacters" => normalize_text(text_pages.fetch("eightCharacters", "")),
      "notes" => normalize_text(text_pages.fetch("notes", ""))
    }
  }
end

def with_hashes(expected)
  hashes = {
    "packedEntry" => sha256(expected.fetch("packedEntry")),
    "calculation" => sha256(expected.fetch("textPages").fetch("calculation")),
    "eightCharacters" => sha256(expected.fetch("textPages").fetch("eightCharacters")),
    "notes" => sha256(expected.fetch("textPages").fetch("notes"))
  }
  expected.merge("sha256" => hashes)
end

def compare_field!(case_id, field, expected, actual)
  return if expected == actual

  warn "Golden fixture mismatch for #{case_id} #{field}"
  warn "Expected SHA256: #{sha256(expected)}"
  warn "Actual SHA256:   #{sha256(actual)}"
  expected_lines = normalize_text(expected).lines
  actual_lines = normalize_text(actual).lines
  max = [expected_lines.length, actual_lines.length].max
  first_diff = (0...max).find { |index| expected_lines[index] != actual_lines[index] }
  if first_diff
    warn "First differing line: #{first_diff + 1}"
    warn "Expected: #{expected_lines[first_diff].inspect}"
    warn "Actual:   #{actual_lines[first_diff].inspect}"
  end
  exit 1
end

if update
  cases = DEFAULT_CASES.map do |test_case|
    payload = compute_chart(base_url, test_case.fetch("request"))
    test_case.merge("expected" => with_hashes(expected_payload(payload)))
  end
  fixture = {
    "schemaVersion" => 1,
    "source" => "Captured from Moira's legacy calculation core through the headless web bridge.",
    "generatedAt" => Time.now.utc.iso8601,
    "cases" => cases
  }
  FileUtils.mkdir_p(File.dirname(fixture_path))
  File.write(fixture_path, "#{JSON.pretty_generate(fixture)}\n")
  puts "Updated golden fixtures: #{fixture_path}"
  exit 0
end

unless File.file?(fixture_path)
  warn "Golden fixture not found: #{fixture_path}"
  warn "Run: #{$PROGRAM_NAME} --update #{base_url}"
  exit 2
end

fixture = JSON.parse(File.read(fixture_path))
cases = fixture.fetch("cases")
cases.each do |test_case|
  case_id = test_case.fetch("id")
  payload = compute_chart(base_url, test_case.fetch("request"))
  actual = expected_payload(payload)
  expected = test_case.fetch("expected")
  compare_field!(case_id, "packedEntry", expected.fetch("packedEntry"), actual.fetch("packedEntry"))
  expected.fetch("textPages").each do |page, expected_text|
    compare_field!(case_id, "textPages.#{page}", expected_text, actual.fetch("textPages").fetch(page))
  end
  expected_hashes = expected.fetch("sha256", {})
  actual_hashes = with_hashes(actual).fetch("sha256")
  expected_hashes.each do |field, expected_hash|
    compare_field!(case_id, "sha256.#{field}", expected_hash, actual_hashes.fetch(field))
  end
  puts "Golden fixture OK: #{case_id}"
end

puts "Golden text fixtures verified for #{cases.length} case(s)."
