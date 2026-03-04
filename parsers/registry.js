// ======================================
// Parser Registry
// ======================================
// To add a new parser:
//   1. Create parsers/<name>.js exporting a parse(rawText) function
//   2. Import it here and add an entry below with available: true

import { parseJBossLog } from './jboss.js';

export const PARSERS = {
  jboss: {
    name: 'JBoss EAP 6.4',
    hint: 'Suporta arquivos de log do JBoss EAP 6.4',
    available: true,
    parse: parseJBossLog
  },
  springboot: {
    name: 'Spring Boot',
    hint: 'Suporta logs do Spring Boot (Logback / Log4j2)',
    available: false,
    parse: null
  },
  wildfly: {
    name: 'WildFly',
    hint: 'Suporta logs do WildFly EAP 7+',
    available: false,
    parse: null
  },
  tomcat: {
    name: 'Tomcat',
    hint: 'Suporta logs do Apache Tomcat (catalina.out)',
    available: false,
    parse: null
  }
};
