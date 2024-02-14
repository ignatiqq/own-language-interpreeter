"use strict";
exports.__esModule = true;
exports.Parser = void 0;
var error_1 = require("../error/error");
var Expressions_1 = require("../expressions/Expressions");
var Interpreter_1 = require("../Interpreter");
var statements_1 = require("../statements/statements");
var tokensType_1 = require("../tokens/constants/tokensType");
/**
 * Парсер преобразует набор токенов в правила языка
 * Каждое правило грамматики языка становиться методом этого класса
 * (Преобразуем токены созданные сканером (лексическим анализатором) в узлы синтаскического дерева)
 * метод синтакского анализа - "рекурсивный спуск"
 * Спуск описывается как «рекурсивный», потому что когда грамматическое правило
 * ссылается на себя — прямо или косвенно — это преобразуется в рекурсивный вызов функции.
 *  ---------------------------------------------------------
 *  Grammar notation	              Code representation
 *
 *  Terminal (определение правила)	  Code to match and consume a token - единственный символ (if) (1) (a)
 *  Nonterminal (ссылка на правило)	  Call to that rule’s function      - рекурсивное правило для составления терминалов
 *  |                                 if or switch statement            - Вместо повторения имени правила каждый раз, когда мы хотим добавить для него еще одно производство, мы разрешим серию производств, разделенных вертикальной чертой
 *  * or +	                          while or for loop                 - рекурсия
 *  ?	                              if statement
 *
 * все это правила (условные) контекстно свободной грамматики
 */
var Parser = /** @class */ (function () {
    function Parser(tokens) {
        this.tokens = tokens;
        this.coursor = 0;
    }
    Parser.prototype.parse = function () {
        try {
            var statements = [];
            while (!this.isAtEnd()) {
                statements.push(this.declaration());
            }
            console.log('parser.parse', { statements: statements });
            return statements;
        }
        catch (error) {
            return;
        }
    };
    // @ts-ignore в любом случае вернет Stmt
    // или стригерит ошибку которая развернет стек и пуш в стейтментс не выполнится
    Parser.prototype.declaration = function () {
        try {
            return this.statement();
        }
        catch (error) {
            this.synchronize();
            console.error(error);
        }
    };
    Parser.prototype.parenthlessBlock = function () {
        return new statements_1.BlockStmt(this.block());
    };
    Parser.prototype.block = function () {
        var statements = [];
        while (!this.check(tokensType_1.TOKEN_TYPES.RIGHT_BRACE) && !this.isAtEnd()) {
            var stmt = this.declaration();
            statements.push(stmt);
        }
        this.consume(tokensType_1.TOKEN_TYPES.RIGHT_BRACE, 'Expected } after block.');
        return statements;
    };
    Parser.prototype.varStmtDeclaration = function () {
        var token = this.consume(tokensType_1.TOKEN_TYPES.IDENTIFIER, 'Expected variable name');
        var intializer = null;
        if (this.match(tokensType_1.TOKEN_TYPES.EQUAL)) {
            // recursively deep for "Identifier" at "primary" literals
            intializer = this.expression();
        }
        this.consume(tokensType_1.TOKEN_TYPES.SEMICOLON, 'Semicolon after expression are required');
        return new statements_1.VarStmt(token, intializer);
    };
    Parser.prototype.statement = function () {
        if (this.match(tokensType_1.TOKEN_TYPES.PRINT))
            return this.printStatement();
        if (this.match(tokensType_1.TOKEN_TYPES.VAR))
            return this.varStmtDeclaration();
        if (this.match(tokensType_1.TOKEN_TYPES.LEFT_BRACE))
            return this.parenthlessBlock();
        if (this.match(tokensType_1.TOKEN_TYPES.IF))
            return this.ifStatement();
        if (this.match(tokensType_1.TOKEN_TYPES.WHILE))
            return this.whileStatement();
        if (this.match(tokensType_1.TOKEN_TYPES.FOR))
            return this.forStatement();
        if (this.match(tokensType_1.TOKEN_TYPES.FUNCTION))
            return this.funcDeclaration('function');
        if (this.match(tokensType_1.TOKEN_TYPES.CLASS))
            return this.classDeclaration();
        if (this.match(tokensType_1.TOKEN_TYPES.RETURN))
            return this.returnStatement();
        return this.expressionStatement();
    };
    Parser.prototype.returnStatement = function () {
        var returnToken = this.previous();
        var value = null;
        if (!this.check(tokensType_1.TOKEN_TYPES.SEMICOLON)) {
            value = this.expression();
        }
        this.consume(tokensType_1.TOKEN_TYPES.SEMICOLON, 'Expected ";" after return statement');
        return new statements_1.ReturnStmt(returnToken, value);
    };
    Parser.prototype.classDeclaration = function () {
        var name = this.consume(tokensType_1.TOKEN_TYPES.IDENTIFIER, 'Expected class name.');
        this.consume(tokensType_1.TOKEN_TYPES.LEFT_BRACE, 'Expected "{" before class body.');
        var methods = [];
        while (!this.check(tokensType_1.TOKEN_TYPES.RIGHT_BRACE) && !this.isAtEnd()) {
            methods.push(this["function"]('method'));
        }
        this.consume(tokensType_1.TOKEN_TYPES.RIGHT_BRACE, 'Expected } after class body.');
        return new statements_1.ClassStmt(name, methods);
    };
    Parser.prototype.funcDeclaration = function (kind) {
        return this["function"](kind);
    };
    Parser.prototype["function"] = function (kind) {
        var name = this.consume(tokensType_1.TOKEN_TYPES.IDENTIFIER, 'Expected ' + kind + ' name');
        this.consume(tokensType_1.TOKEN_TYPES.LEFT_PAREN, 'Expected "(" after ' + kind + ' name');
        var params = [];
        // function may be with empty params
        if (!this.check(tokensType_1.TOKEN_TYPES.RIGHT_PAREN)) {
            // перебор всех параметров функции
            do {
                if (params.length > 254) {
                    this.error(this.peek(), "Can't have more than 255 parameters.");
                }
                params.push(this.consume(tokensType_1.TOKEN_TYPES.IDENTIFIER, "Expected parameter name"));
            } while (this.match(tokensType_1.TOKEN_TYPES.COMMA));
        }
        this.consume(tokensType_1.TOKEN_TYPES.RIGHT_PAREN, "Expected ')' after parameters");
        this.consume(tokensType_1.TOKEN_TYPES.LEFT_BRACE, 'Expected "{" before ' + kind + ' body');
        var stmts = this.block();
        return new statements_1.FunctionStmt(name, params, stmts);
    };
    /**
     * Синтаксический сахар над while
     * @returns
     */
    Parser.prototype.forStatement = function () {
        this.consume(tokensType_1.TOKEN_TYPES.LEFT_PAREN, 'Expected ( before for statement');
        // форм инициализатора (начального значения) может быть много поэтому у нас есть все эти условия
        var initializer;
        // without initializer
        if (this.match(tokensType_1.TOKEN_TYPES.SEMICOLON)) {
            initializer = null;
        }
        else if (this.match(tokensType_1.TOKEN_TYPES.VAR)) {
            initializer = this.varStmtDeclaration();
        }
        else {
            initializer = this.expressionStatement();
        }
        var condition = null;
        if (!this.check(tokensType_1.TOKEN_TYPES.SEMICOLON)) {
            condition = this.expression();
        }
        this.consume(tokensType_1.TOKEN_TYPES.SEMICOLON, "Expected ';' after loop condition.");
        var increment = null;
        if (!this.check(tokensType_1.TOKEN_TYPES.RIGHT_PAREN)) {
            increment = this.expression();
        }
        this.consume(tokensType_1.TOKEN_TYPES.RIGHT_PAREN, "Expected ')' after for clauses.");
        var body = this.statement();
        // ВСЕ ВЫРАЖЕНИЯ ЦИКЛА "condition", "initializer", "increment"
        // заключены в BlockExpr, потомучто будут видны только в целе функций
        // loop = блочная область видимости
        // начинаем обессахаривать "while" for циклом с конца
        if (increment !== null) {
            // с каждым выполнение body, должен выполняться экспрш цикла
            // поэтому у нас вместо 1 стейтмента (боди) 2
            body = new statements_1.BlockStmt([body, new statements_1.ExpressionStmt(increment)]);
        }
        // если кондишна нет, он всегда тру, ждем брейка
        if (condition === null)
            condition = new Expressions_1.LiteralExpr(true);
        body = new statements_1.WhileStmt(condition, body);
        // если есть initializer он выполняется тоже один раз
        if (initializer !== null) {
            body = new statements_1.BlockStmt([initializer, body]);
        }
        return body;
    };
    Parser.prototype.ifStatement = function () {
        this.consume(tokensType_1.TOKEN_TYPES.LEFT_PAREN, 'Expected ( before if statement');
        var expr = this.expression();
        this.consume(tokensType_1.TOKEN_TYPES.RIGHT_PAREN, 'Expected ) after if statement');
        var thenBranch = this.statement();
        // let and null assign because "else" is conditionally statement
        var elseBranch = null;
        if (this.match(tokensType_1.TOKEN_TYPES.ELSE)) {
            elseBranch = this.statement();
        }
        return new statements_1.IfStmt(expr, thenBranch, elseBranch);
    };
    Parser.prototype.whileStatement = function () {
        this.consume(tokensType_1.TOKEN_TYPES.LEFT_PAREN, 'Expected ( opens while');
        var expr = this.expression();
        this.consume(tokensType_1.TOKEN_TYPES.RIGHT_PAREN, 'Expected ) after while');
        var blockStmt = this.statement();
        return new statements_1.WhileStmt(expr, blockStmt);
    };
    /**
     * мы берем expression значения токенов, потомучто
     * в принт можно передать как бинарные так унарные, так
     * и сложные выражения со скобками умножением и тд
     */
    Parser.prototype.printStatement = function () {
        // только expressions могут быть переданы в print
        // print if(true) {}; <- низя
        var expr = this.expression();
        // SEMICOLON after expression is required
        // in our language
        this.consume(tokensType_1.TOKEN_TYPES.SEMICOLON, 'Semicolon after expression are required');
        return new statements_1.PrintStmt(expr);
    };
    Parser.prototype.expressionStatement = function () {
        var expr = this.expression();
        // SEMICOLON after expression is required
        // in our language
        this.consume(tokensType_1.TOKEN_TYPES.SEMICOLON, 'Semicolon after expression are required');
        return new statements_1.ExpressionStmt(expr);
    };
    Parser.prototype.expression = function () {
        return this.assignment();
    };
    // присваивание |
    //              v
    // var variable = 'value';
    Parser.prototype.assignment = function () {
        // выражение может быть слева
        //                                      |
        //                                      v
        // это может быть либо VarExpr -> var name =
        //                                   |
        //                                   v
        // либо любым Expr Expr -> getObj().x = 
        var expr = this.logical_or();
        if (this.match(tokensType_1.TOKEN_TYPES.EQUAL)) {
            // equals token to reoport to the error (line)
            var equals = this.previous();
            // вычисляем значение справа (Expression(s))
            var value = this.assignment();
            // проверяем является ли expression Identifier (VarExpr)
            // var name = 'ignat';
            // name = 'timur';   <-----
            if (expr instanceof Expressions_1.VariableExpr) {
                // если предыдущий токен это 
                // VarExpr, тоесть identifier,
                // то мы возвращаем Assignment Expression
                var token = expr.token;
                return new Expressions_1.AssignmentExpr(token, value);
            }
            else 
            // проверяем является ли expression Identifier (VarExpr)
            // const instance = SomeClass();
            // instance.field1.field2 = 'timur';   <-----
            if (expr instanceof Expressions_1.GetExpr) {
                var get = expr;
                return new Expressions_1.SetExpr(get.object, get.token, value);
            }
            this.error(equals, "Invalid assignment target.");
        }
        return expr;
    };
    Parser.prototype.logical_or = function () {
        var expr = this.logical_and();
        while (this.match(tokensType_1.TOKEN_TYPES.OR)) {
            var prev = this.previous();
            var right = this.logical_and();
            expr = new Expressions_1.LogicalExpr(expr, prev, right);
        }
        return expr;
    };
    Parser.prototype.logical_and = function () {
        var expr = this.equality();
        while (this.match(tokensType_1.TOKEN_TYPES.AND)) {
            var prev = this.previous();
            var right = this.equality();
            expr = new Expressions_1.LogicalExpr(expr, prev, right);
        }
        return expr;
    };
    Parser.prototype.equality = function () {
        // любой expression,
        // будь то primary (number) или binary expression
        // изза рекурсии и внизсходящиего алгоритма парсера
        // сначала берем самое приоритетное выражение парсера (число -> отрицание -> умножение) и т.д.
        var expr = this.comparison();
        while (this.matchMany(tokensType_1.TOKEN_TYPES.EQUAL_EQUAL, tokensType_1.TOKEN_TYPES.NOT_EQUAL)) {
            // мы уже увеличели каутнер mathMany методом, поэтому берем предыдущий токен
            var operator = this.previous();
            var right = this.comparison();
            expr = new Expressions_1.BinaryExpr(expr, operator, right);
        }
        return expr;
    };
    Parser.prototype.comparison = function () {
        var expr = this.term();
        while (this.matchMany(tokensType_1.TOKEN_TYPES.LESS, tokensType_1.TOKEN_TYPES.GREATER, tokensType_1.TOKEN_TYPES.GREATER_EQUAL, tokensType_1.TOKEN_TYPES.LESS_EQUAL)) {
            var operator = this.previous();
            var right = this.term();
            return new Expressions_1.BinaryExpr(expr, operator, right);
        }
        return expr;
    };
    Parser.prototype.term = function () {
        var expr = this.factor();
        while (this.matchMany(tokensType_1.TOKEN_TYPES.MINUS, tokensType_1.TOKEN_TYPES.PLUS)) {
            var operator = this.previous();
            var right = this.factor();
            expr = new Expressions_1.BinaryExpr(expr, operator, right);
        }
        return expr;
    };
    Parser.prototype.factor = function () {
        var expr = this.unary();
        // error in this.match (because this.previous is undefined)
        // Error here get type of undefined
        if (this.matchMany(tokensType_1.TOKEN_TYPES.SLASH, tokensType_1.TOKEN_TYPES.STAR)) {
            var operator = this.previous();
            var right = this.unary();
            expr = new Expressions_1.BinaryExpr(expr, operator, right);
        }
        return expr;
    };
    /**
     * unary expression creator also can return PrimaryExprReturnType type
     * because it's recursive and it have access to get primary expression token
     * @returns {Expr}
     */
    Parser.prototype.unary = function () {
        if (this.matchMany(tokensType_1.TOKEN_TYPES.NOT, tokensType_1.TOKEN_TYPES.MINUS)) {
            var operator = this.previous();
            // 2 !
            // 3 hello
            var unary = this.unary();
            // 2 UnaryExpr: {operator: "!", expression: "hello"}
            // 1 UnaryExpr: {operator: "!", expression: UnaryExpr: {operator: "!", expression: "hello"}}
            return new Expressions_1.UnaryExpr(operator, unary);
        }
        return this.call();
    };
    /**
     * fun doSomething() {}
     *
     * call -> doSomething()();
     * where expr = doSomething and then check for "LEFT_PAREN ("
     */
    Parser.prototype.call = function () {
        // actually identifier if (reall call expr)
        var expr = this.primary();
        while (true) {
            if (this.match(tokensType_1.TOKEN_TYPES.LEFT_PAREN)) {
                // если это вызов функции
                // передаем callee (Identifier) в вспомогательную функцию
                expr = this.finishCall(expr);
                continue;
            }
            if (this.match(tokensType_1.TOKEN_TYPES.DOT)) {
                // new GetExpr(expr as object, name of field);
                var name_1 = this.consume(tokensType_1.TOKEN_TYPES.IDENTIFIER, "Expect property name after '.'");
                expr = new Expressions_1.GetExpr(expr, name_1);
                continue;
            }
            break;
        }
        return expr;
    };
    Parser.prototype.finishCall = function (callee) {
        var args = [];
        // edge case without args
        if (!this.check(tokensType_1.TOKEN_TYPES.RIGHT_PAREN)) {
            do {
                if (args.length > 254) {
                    this.error(this.peek(), "Can't have more than 255 arguments");
                }
                // expression после точки будет съеденно (передвинут курсор), поэтому мы бесконечно смотрим на запятые
                // и анализируем expressions
                args.push(this.expression());
                // съедаем запятую
            } while (this.match(tokensType_1.TOKEN_TYPES.COMMA));
        }
        var paren = this.consume(tokensType_1.TOKEN_TYPES.RIGHT_PAREN, "Expected ')' after function call");
        // callee => VariableExpr
        return new Expressions_1.CallExpr(callee, paren, args);
    };
    /**
     * primary method which return Literal and Grouping expression
     * primitive data types
     * @returns {Expr}
     */
    Parser.prototype.primary = function () {
        if (this.match(tokensType_1.TOKEN_TYPES.FALSE))
            return new Expressions_1.LiteralExpr(false);
        if (this.match(tokensType_1.TOKEN_TYPES.TRUE))
            return new Expressions_1.LiteralExpr(true);
        if (this.match(tokensType_1.TOKEN_TYPES.NULL))
            return new Expressions_1.LiteralExpr(null);
        if (this.match(tokensType_1.TOKEN_TYPES.IDENTIFIER))
            return new Expressions_1.VariableExpr(this.previous());
        if (this.match(tokensType_1.TOKEN_TYPES.NUMBER))
            return new Expressions_1.LiteralExpr(Number(this.previous().lexeme));
        if (this.match(tokensType_1.TOKEN_TYPES.STRING))
            return new Expressions_1.LiteralExpr(this.previous().lexeme);
        if (this.match(tokensType_1.TOKEN_TYPES.LEFT_PAREN)) {
            var expr = this.expression();
            this.consume(tokensType_1.TOKEN_TYPES.RIGHT_PAREN, 'Expected ")" after grouping expression');
            return new Expressions_1.GroupingExpr(expr);
        }
        throw this.error(this.peek(), 'Expect expression.');
    };
    Parser.prototype.advance = function () {
        this.coursor++;
    };
    Parser.prototype.previous = function () {
        return this.peek({ offset: -1 });
    };
    Parser.prototype.peek = function (options) {
        var offset = (options === null || options === void 0 ? void 0 : options.offset) || 0;
        return this.tokens[this.coursor + offset];
    };
    Parser.prototype.isAtEnd = function () {
        return this.peek().type === tokensType_1.TOKEN_TYPES.EOF;
    };
    Parser.prototype.check = function (type) {
        if (this.isAtEnd())
            return false;
        return this.peek().type === type;
    };
    /**
     * match метод проверяет соответствует ли токен(ы) ожидаемому типу
     * возвращает true при первом соответствии type
     * @param types
     * @returns
     */
    Parser.prototype.match = function (token) {
        if (this.isAtEnd())
            return false;
        if (this.check(token)) {
            this.advance();
            return true;
        }
        return false;
    };
    /**
     * matchMany method который позволяет матчить сразу несколько токенов метода match
     */
    Parser.prototype.matchMany = function () {
        var tokenTypes = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            tokenTypes[_i] = arguments[_i];
        }
        if (this.isAtEnd())
            return false;
        for (var _a = 0, tokenTypes_1 = tokenTypes; _a < tokenTypes_1.length; _a++) {
            var token = tokenTypes_1[_a];
            var result = this.match(token);
            if (result)
                return true;
        }
        return false;
    };
    /**
     * Panick mode method which throw an error if this.tokens[this.coursor] type
     * and argument type are not same
     */
    Parser.prototype.consume = function (type, message) {
        if (this.check(type)) {
            this.advance();
            return this.previous();
        }
        throw this.error(this.peek(), message);
    };
    Parser.prototype.error = function (token, message) {
        Interpreter_1["default"].error(token, message);
        return new error_1.ParseError();
    };
    Parser.prototype.synchronize = function () {
        this.advance();
        while (!this.isAtEnd()) {
            if (this.previous().type == tokensType_1.TOKEN_TYPES.SEMICOLON)
                return;
            switch (this.peek().type) {
                case tokensType_1.TOKEN_TYPES.CLASS:
                case tokensType_1.TOKEN_TYPES.FUNCTION:
                case tokensType_1.TOKEN_TYPES.VAR:
                case tokensType_1.TOKEN_TYPES.FOR:
                case tokensType_1.TOKEN_TYPES.IF:
                case tokensType_1.TOKEN_TYPES.WHILE:
                case tokensType_1.TOKEN_TYPES.PRINT:
                case tokensType_1.TOKEN_TYPES.RETURN:
                    return;
            }
            this.advance();
        }
    };
    return Parser;
}());
exports.Parser = Parser;
