-- Тарифы (rate_type: setup | growth | plateau | decline | lead | signing)
CREATE TABLE IF NOT EXISTS cost_rates (
  rate_type TEXT PRIMARY KEY,
  amount    NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO cost_rates (rate_type, amount) VALUES
  ('setup',   0),
  ('growth',  0),
  ('plateau', 0),
  ('decline', 0),
  ('lead',    0),
  ('signing', 0)
ON CONFLICT (rate_type) DO NOTHING;

-- Понедельные результаты по клиентам
CREATE TABLE IF NOT EXISTS client_weekly_performance (
  client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  week_date   DATE    NOT NULL,
  performance TEXT    NOT NULL CHECK (performance IN ('growth', 'plateau', 'decline')),
  PRIMARY KEY (client_id, week_date)
);

-- Стартовая настройка (разовая, по клиенту)
CREATE TABLE IF NOT EXISTS client_setups (
  client_id INTEGER PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  week_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Привлечение клиентов (разовая привязка к сотруднику)
CREATE TABLE IF NOT EXISTS client_acquisitions (
  client_id   INTEGER PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  week_date   DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
